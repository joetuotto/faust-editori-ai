/**
 * FAUST - Simple Clean Implementation
 * Uses new faust-simple-layout.css
 * v2.0: Project structure for AI book generation
 */

import { AIProviderSettings } from './src/components/AIProviderSettings.js';
import { FaustEditor, MANUSCRIPT_FONTS } from './src/components/FaustEditor.js';
import { ErrorBoundary } from './src/components/ErrorBoundary.js';
import { ImportPreviewDialog } from './src/components/ImportPreviewDialog.js';
import { buildChapterDocs, applyImport, replaceBlockedReason } from './src/services/project/importPlan.js';
// One request layer, the settings store and the smallest context builder (stage I-02)
import { getAIClient } from './src/services/ai/aiClient.js';
import { useSetting } from './src/components/useSetting.js';
import { AiModelBadge } from './src/components/AiModelSettings.js';
import { BookBriefFields, ChapterNoAIField, useNoAIGuard } from './src/components/ContextFields.js';
import { normalizeContextFields, MESSAGES, isChapterBlocked } from './src/services/ai/contextBuilder.js';
import { modelLabel } from './src/services/format.fi.js';
// failureReason: the reason in '<Toiminto> epäonnistui: <syy>.'; asIsNotice: a stop, the switch and
// the wire guard shown as they are (R-21); bookRunPlan: Magnum Opus without "Ei tekoälylle" chapters;
// sentTarget / placeSentText: an old path's result goes back to the text it was made for (R-18, R-19)
import { failureReason, asIsNotice, bookRunPlan, sentTarget, placeSentText } from './src/services/ai/oldPaths.js';
// The suggestion layer, the undo history from the first keystroke and the usage log (stage I-03)
import { SuggestionBar } from './src/components/SuggestionBar.js';
import { AiUsageLogSection } from './src/components/AiUsageLogSection.js';
import { createSuggestionController } from './src/services/suggestions/suggestionController.js';
import { CommandManager } from './src/utils/CommandManager.js';
import { wordDiff, changeRatio, diffSegments, changeStats } from './src/editor/wordDiff.js';
import { appendRow as appendAiLogRow, createLog as createAiLog, decisionRow } from './src/services/ai/usageLog.js';
import { addAutoSnapshot } from './src/services/project/snapshots.js';
import { getSettingsStore } from './src/services/settingsStore.js';
// Liitä muokkauksina: the clipboard compared with the selection, the differences as suggestions (stage I-04)
import { PasteEditsDialog } from './src/components/PasteEditsDialog.js';
// Pikamuokkaus (Cmd+K): the inline prompt, the right-click Tekoäly submenu, Kokeile toisella mallilla (stage I-05)
import { setupQuickEdit } from './src/services/ai/quickEditSetup.js';
// Älykäs kirjoitus, Tarkista typografia, Voikko and Kielenhuolto in Kielen työkalut, Miksi? (stage I-06)
import { LanguagePanel } from './src/components/LanguagePanel.js';
import { SmartTypingSwitch, LineStartDashSelect } from './src/components/TypographySettings.js';
import { explainChange } from './src/services/ai/proofreadPass.js';
import { createWordCheck } from './src/services/language/wordCheck.js';
import { getContextSession } from './src/services/ai/contextSession.js';
// The text functions Kielenhuolto and Miksi? work with (lines, masking, batches, diff, sentences), handed
// to them as one object so the pure modules have no hard-wired paths; the Cmd+K chip takes the same one
import { TEXT_DEPS as textDeps } from './src/services/language/languageTools.js';
// Tarinakansio in the sidebar and its research-note copy (stage I-07)
import { CodexPanel, CopyToCodexButton } from './src/components/CodexPanel.js';
// Tarkistus, the fifth tab of Tietopaneeli, and its own-check dialog (stage I-08)
import { ReviewPanel } from './src/components/ReviewPanel.js';
import { ReviewCheckDialog, saveCustomCheck } from './src/components/ReviewCheckDialog.js';
import { createDefaultReviewController } from './src/services/review/reviewController.js';
import {
  TextPromptDialog, ConfirmDialog, ShortcutsDialog, ExportDialog, CollectionDialog,
  shortcut, shortcutKeys, count, countParts
} from './src/components/Dialogs.js';
import {
  countWords, countCharacters, countProjectWords, estimatePages,
  toggleInline, setHeading, toggleLinePrefix, insertText, transformSelection,
  trimSpaces, collapseEmptyLines,
  buildSearchPattern, findMatches, replaceAllMatches
} from './src/editor/textTools.js';
import { Icon, icons } from './src/components/icons.js';
// Notifications (F7); then the shared components the cross-region packages use
// (R-71): the header and format bar menus and the four popovers (Popover, usePopover), the sigil bar
// (SigilButton, Tooltip), the voice buttons (VoiceButton), the shared dialog and the Esc chain
// (Dialog, layerStack), Tietopaneeli's tab row and the version stars (Tabs, Rating)
import {
  ToastHost, notify,
  Popover, usePopover, SigilButton, Tooltip, VoiceButton, Dialog, layerStack, Tabs, Rating, DiffView
} from './src/components/ui.js';

const { createElement: e, useState, useEffect, useLayoutEffect, useRef, useMemo } = React;

// Classic scrollbars take room on both sides of the manuscript scroller: their width is
// measured at start and on window focus and written as --scrollbar-w (0px with overlay bars).
function measureScrollbar() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:-99px;width:50px;height:50px;overflow:scroll';
  document.body.append(probe);
  document.documentElement.style.setProperty('--scrollbar-w', (probe.offsetWidth - probe.clientWidth) + 'px');
  probe.remove();
}

// The theme change. Stores the theme, tells the main process (native menus, select lists and
// confirm boxes follow it) and sets data-theme: at once on the first run and under reduced
// motion, otherwise under the golden swipe (styles/faust-tokens.css, part 5).
// A switch during a running swipe cancels it: its timers are cleared and its band removed, so
// the page never shows the intermediate theme and the cross-fade class stays for the new swipe.
let themeSwipe = { timers: [], band: null };
function applyTheme(next, animate) {
  const root = document.documentElement;
  const calm = !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { localStorage.setItem('faust-theme', next); } catch (err) { /* private mode */ }
  if (window.electronAPI && window.electronAPI.setTheme) window.electronAPI.setTheme(next);
  themeSwipe.timers.forEach(clearTimeout);
  if (themeSwipe.band) themeSwipe.band.remove();
  themeSwipe = { timers: [], band: null };
  if (calm) { root.classList.remove('faust-theme-switching'); root.setAttribute('data-theme', next); return; }
  root.classList.add('faust-theme-switching');                      // 80 % dip and colour cross-fade
  const swipe = document.createElement('div');
  swipe.className = 'faust-theme-swipe';                            // the golden band, 800ms after a 150ms dip
  document.body.append(swipe);
  themeSwipe = {
    band: swipe,
    timers: [
      setTimeout(() => root.setAttribute('data-theme', next), 550), // the band is over the centre
      setTimeout(() => {
        swipe.remove();
        if (themeSwipe.band === swipe) { root.classList.remove('faust-theme-switching'); themeSwipe = { timers: [], band: null }; }
      }, 1200)
    ]
  };
}

// ---------------------------------------------------------------------
// Display maps for stored values (menu spec A.4). The code stores and compares the
// English keys; the screen shows these words. Inside a running line a label is written
// in lower case (.toLowerCase()).
// ---------------------------------------------------------------------
const LABELS = {
  status: { plan: 'Suunnitteilla', draft: 'Luonnos', revision: 'Muokattavana', final: 'Valmis' },
  mode: { exploration: 'Ideointi', production: 'Kirjoitus', polish: 'Viimeistely' },
  genre: {
    fiction: 'Kaunokirjallisuus (yleinen)', fantasy: 'Fantasia', scifi: 'Scifi', mystery: 'Dekkari',
    thriller: 'Trilleri', romance: 'Romantiikka', horror: 'Kauhu', literary: 'Taideproosa', nonfiction: 'Tietokirja'
  },
  threadType: {
    main_plot: 'Pääjuoni', subplot: 'Sivujuoni', character_arc: 'Hahmon kehityskaari',
    theme: 'Teema', mystery: 'Arvoitus', romance: 'Rakkausjuoni',
    // written by the thread detection although A.4 does not list it (owner to proofread)
    relationship: 'Ihmissuhde'
  },
  // 'open' is written by the thread detection; it means the same as 'active' (M C.14 row 6: Avoin)
  threadStatus: { planned: 'Suunniteltu', active: 'Avoin', open: 'Avoin', developing: 'Kehittyvä', resolved: 'Ratkaistu', abandoned: 'Hylätty' },
  priority: { critical: 'Kriittinen', high: 'Suuri', medium: 'Tavallinen', low: 'Pieni', info: 'Tiedoksi' },
  severity: { critical: 'Vakavia', high: 'Tärkeitä', medium: 'Lieviä', low: 'Lieviä' },
  tempo: { slow: 'hidas', medium: 'keskinopea', fast: 'nopea' },
  placeType: {
    home: 'Koti', city: 'Kaupunki', nature: 'Luonto', building: 'Rakennus',
    vehicle: 'Ajoneuvo', fantasy: 'Fantasiamaailma', other: 'Muu'
  },
  placeAtmosphere: {
    peaceful: 'Rauhallinen', tense: 'Jännittävä', mysterious: 'Mystinen', dangerous: 'Vaarallinen',
    cozy: 'Viihtyisä', eerie: 'Aavemainen', busy: 'Vilkas', abandoned: 'Hylätty'
  },
  placeImportance: { major: 'Pääpaikka', minor: 'Sivupaikka', mentioned: 'Mainittu' },
  bigFive: {
    openness: 'Avoimuus', conscientiousness: 'Tunnollisuus', extraversion: 'Ulospäinsuuntautuneisuus',
    agreeableness: 'Sovinnollisuus', neuroticism: 'Tunne-elämän epävakaus'
  },
  annotationType: {
    ai_consistency: 'Ristiriita', ai_quality: 'Laatu', ai_suggestion: 'Parannusehdotus', ai_plot_thread: 'Juonilanka',
    user_note: 'Reunahuomautus', user_comment: 'Kommentti', highlight: 'Korostus'
  },
  researchType: { note: 'Muistiinpano', link: 'Linkki', image: 'Tiedostoviite', pdf: 'Tiedostoviite' },
  costSource: { anthropic: 'Claude', cherry: 'Cherry Studio' }
};

// A stored value of a closed list as the author reads it; an unknown value as it is, without underscores
const labelOf = (group, value) =>
  (LABELS[group] && LABELS[group][value]) || String(value == null ? '' : value).replace(/_/g, ' ');

// The values of a character profile (Uusi hahmo, Hahmot, the split view), menu spec A.4
const PROFILE_LABELS = {
  // Rooli tarinassa, rooli ryhmässä
  protagonist: 'päähenkilö', antagonist: 'vastustaja', supporting: 'sivuhenkilö',
  leader: 'johtaja', mediator: 'sovittelija', rebel: 'kapinallinen', outsider: 'ulkopuolinen', follower: 'seuraaja',
  // Minätilat, draamakolmio, viestintätyyli
  parent: 'vanhempi', adult: 'aikuinen', child: 'lapsi',
  victim: 'uhri', rescuer: 'pelastaja', persecutor: 'vainoaja',
  assertive: 'jämäkkä', passive: 'passiivinen', aggressive: 'hyökkäävä', passive_aggressive: 'passiivis-aggressiivinen',
  // Psyykkinen oireilu, selviytymiskeino, trauma, maailmankuva
  anxiety: 'ahdistuneisuus', mood: 'mielialahäiriö', personality: 'persoonallisuushäiriö', trauma_related: 'traumaperäinen',
  heroism: 'sankaruus', religiosity: 'uskonnollisuus', creativity: 'luovuus', relationships: 'ihmissuhteet', denial: 'kieltäminen',
  childhood: 'lapsuus', loss: 'menetys', violence: 'väkivalta', betrayal: 'petos', other: 'muu',
  optimistic: 'optimistinen', pessimistic: 'pessimistinen', realistic: 'realistinen', cynical: 'kyyninen',
  // Arkkityyppi
  hero: 'sankari', mentor: 'mentori', threshold_guardian: 'kynnyksen vartija', herald: 'sanansaattaja',
  shapeshifter: 'muodonmuuttaja', shadow: 'varjo', ally: 'liittolainen', trickster: 'veijari', innocent: 'viaton',
  sage: 'viisas', explorer: 'tutkimusmatkailija', outlaw: 'lainsuojaton', magician: 'maagi', lover: 'rakastaja',
  jester: 'narri', caregiver: 'hoivaaja', creator: 'luoja', ruler: 'hallitsija',
  // Sankarin matka
  ordinary_world: 'tavallinen maailma', call_to_adventure: 'kutsu seikkailuun', refusal: 'kutsusta kieltäytyminen',
  meeting_mentor: 'mentorin kohtaaminen', crossing_threshold: 'kynnyksen ylitys', tests: 'koetukset',
  approach: 'lähestyminen', ordeal: 'koettelemus', reward: 'palkinto', road_back: 'paluumatka',
  resurrection: 'ylösnousemus', return_with_elixir: 'paluu eliksiirin kanssa'
};
// A value stored in words (an old file, a hand-made character: 'Etsijä') follows the table's case, lower case
// after a label (M B.1: 'Arkkityyppi: etsijä'); upperFirst() capitalises it where it stands alone. An acronym stays.
const label = (value) => {
  if (PROFILE_LABELS[value]) return PROFILE_LABELS[value];
  const text = String(value == null ? '' : value).replace(/_/g, ' ');
  return /^[A-ZÅÄÖ][a-zåäö]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
};

// The words of a chapter version, counted from its text (the list, the Luku tab and the comparison
// agree, M B.13: one count); a stored count is used only when the version carries no text
const versionWords = (version) => (version && typeof version.content === 'string'
  ? version.content.split(/\s+/).filter(Boolean).length
  : Number(version && version.wordCount) || 0);

// The categorical thread colours, in thread order: Aikajana's bars and the stripes of the Juonilangat cards
const THREAD_HUES = ['var(--thread-1)', 'var(--thread-2)', 'var(--thread-3)', 'var(--thread-4)', 'var(--thread-5)', 'var(--thread-6)'];

// Chapter status as stored: the legacy collection filter 'revised' is 'revision', a missing status is 'plan'
const normStatus = (value) => (value === 'revised' ? 'revision' : (value || 'plan'));

// An excerpt of the manuscript outside the editor (a search hit, a bookmark): cut at word boundaries,
// on one line, with the Markdown markers taken out (V 6.3: markers never at full strength outside the
// editor). Returns the text before the hit, the hit and the text after it.
const stripMarkers = (text) => String(text || '').replace(/^#{1,6}\s+/gm, '').replace(/\*\*|__|~~|[*_`]/g, '').replace(/\s+/g, ' ');
const excerptOf = (text, start, end, radius) => {
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, end + radius);
  let before = text.substring(from, start);
  let after = text.substring(end, to);
  if (from > 0 && /\s/.test(before)) before = before.replace(/^\S*\s+/, '');
  if (to < text.length && /\s/.test(after)) after = after.replace(/\s+\S*$/, '');
  return { before: stripMarkers(before).replace(/^\s+/, ''), hit: stripMarkers(text.substring(start, end)), after: stripMarkers(after).replace(/\s+$/, '') };
};

// Status chip classes (visual foundations 4.4), used with LABELS.status
const STATUS_CHIP = {
  plan: 'faust-chip--hollow',
  draft: 'faust-chip--hollow',
  revision: 'faust-chip--accent faust-chip--dot',
  final: 'faust-chip--success faust-chip--dot'
};

// Menu commands that show a docked panel leave focus mode first: a panel is never open inside it
const LEAVES_FOCUS = [
  'toggle-sidebar', 'toggle-inspector', 'toggle-ai-panel', 'toggle-chat-window', 'toggle-corkboard',
  'toggle-split-view', 'toggle-bookmarks', 'show-snapshots', 'show-settings', 'show-ai-settings',
  // I-06: the four doors of Kielen työkalut
  'check-typography', 'proofread-chapter', 'voikko-check-chapter', 'voikko-help',
  // I-07: Tarinakansio opens the sidebar
  'show-codex',
  // I-08: Tietopaneeli on its Tarkistus tab
  'show-review'
];

// 16.11.2026 klo 14.32
const formatDateTimeFi = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fi-FI') + ' klo ' + date.toLocaleTimeString('fi-FI', { hour: 'numeric', minute: '2-digit' });
};

// The reason of a failed listen() in the same form: voiceInput.js rejects with Finnish sentences,
// recognition.start() with the browser's English DOMException, which is never shown as it is
const voiceFailureReason = (error) => {
  if (window.DOMException && error instanceof window.DOMException) return 'puheentunnistusta ei voitu käynnistää';
  if (error && error.name && error.name !== 'Error') return 'tuntematon virhe';
  const text = failureReason(error);
  if (/^tuntematon äänivirhe$/i.test(text)) return 'tuntematon virhe';
  if (/^äänitunnistus keskeytetty$/i.test(text)) return 'puheentunnistus keskeytyi';
  return text.charAt(0).toLowerCase() + text.slice(1);
};

// The key of a place in project.continuity.locations. The app keys a place by its name, but an old
// or hand-edited file may hold one under another key or without a name: the stored object decides.
const storedLocationKey = (locations, location) => {
  const byObject = Object.keys(locations).find((key) => locations[key] === location);
  if (byObject !== undefined) return byObject;
  return location && location.name && Object.prototype.hasOwnProperty.call(locations, location.name) ? location.name : undefined;
};

// One plot thread: by id, or by the stored object when a thread from an old file has none
const sameThread = (a, b) => (b && b.id ? a.id === b.id : a === b);

// Money as the author reads it (lead decision 2): noin 0,12 $; an amount above zero and under half
// a cent is alle 0,01 $ (two decimals would read 0,00); nothing at all is 0 $. Every money string uses it.
const formatCostFi = (amount) => {
  const value = Number(amount) || 0;
  if (value === 0) return '0 $';
  if (value > 0 && value < 0.005) return 'alle 0,01 $';
  return 'noin ' + value.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
};

// CharacterGenerator, callAIProvider, and RefinementManager
// are now loaded from src/services/ai/ as IIFE modules

// Create default project structure
const createDefaultProject = () => ({
  title: 'Nimetön projekti',
  author: '',
  genre: 'fiction',
  language: 'fi',
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  version: '2.0',

  // Content structure (hierarchical)
  // Types: 'folder', 'chapter', 'scene'
  structure: [
    {
      id: 'chapter-1',
      type: 'chapter',
      title: 'Luku 1',
      order: 0,
      content: '',
      wordCount: 0,
      children: [],

      // AI-Enhanced Metadata
      synopsis: '',  // AI-generated or manual
      synopsisAI: '', // AI-generated version
      synopsisManual: '', // User override

      notes: '',     // Research notes, ideas
      notesAI: {
        characterMentions: [],  // AI-detected characters
        locations: [],          // AI-detected places
        timeframe: '',          // AI-detected time
        mood: '',               // AI-analyzed mood
        themes: [],             // AI-detected themes
        continuityIssues: []    // AI-found problems
      },

      // Status & Quality
      status: 'draft', // draft, revised, final
      noAI: false,     // Ei tekoälylle: the text and summary go to no model
      aiQuality: {
        score: 0,              // 0-10 AI quality rating
        lastAnalyzed: null,
        issues: [],            // [{type, severity, msg}]
        strengths: [],         // What's good
        suggestions: [],       // How to improve
        readiness: 'draft'     // AI recommendation
      },

      // Structure hints
      structureHints: {
        shouldBeSplit: false,       // AI suggests splitting
        suggestedSceneBreaks: [],   // Positions for scene breaks
        relatedChapters: [],        // Similar content elsewhere
        missingTransition: false    // Needs better flow
      },

      // Pacing
      pacing: {
        speed: 'medium',      // slow, medium, fast (AI-analyzed)
        tension: 0,           // 0-10
        wordDensity: 0,       // words per concept
        dialogueRatio: 0      // % dialogue vs narrative
      },

      label: '',     // User-defined label/color
      color: '',     // For corkboard view

      created: new Date().toISOString(),
      modified: new Date().toISOString(),

      // Version history
      versions: []   // [{timestamp, content, aiDiff}]
    }
  ],

  // Outline for AI generation
  outline: [],

  // Knowledge base
  characters: [],
  locations: [],
  timeline: [],

  // Ohjeet tekoälylle and Tarinakansio (contracts.md section 5; the codex UI comes at I-07)
  brief: '',
  style: '',
  avoidWords: [],
  codex: [],
  codexLegacyHandled: [],
  aiLog: createAiLog(new Date().toISOString()),   // Tekoälyn käyttö (contracts.md 1.3)

  // Kielen työkalut (contracts.md section 5, stage I-06). Rivin alun viiva: null follows the genre;
  // Kielenhuolto skips quote lines and sends dialogue; Tahallista / huomioi is shared with Tarkistus
  typography: { lineStartDash: null },
  proofread: { skipQuoteLines: true, skipDialogue: false },
  keepNote: '',

  // Bookmarks - quick navigation points
  bookmarks: [],  // [{id, chapterId, position, name, color, created}]

  // Named snapshots - manual project-level saves
  snapshots: [],  // [{id, name, created, description, structure (deep copy of chapters)}]

  // Collections - dynamic chapter groupings
  collections: [],  // [{id, name, type, filter, chapterIds, color}]

  // Cast planning (Phase 1 of Character Archetype Builder)
  castPlan: {
    defined: false,
    characterTypes: [],  // User-defined types like "stoic elder", "young idealist"
    totalCharacters: 0,
    suggestedArchetypes: [],  // AI suggestions
    castDynamics: null,  // AI-analyzed relationships
    warnings: []
  },

  // Tarkistus (contracts.md section 5, stage I-08): the limit of Pitkät virkkeet; the findings live in the chapters
  review: { longSentenceWords: 30 },

  // Goals
  targets: {
    totalWords: 80000,
    dailyWords: 1000,
    currentTotal: 0
  },

  // AI settings
  ai: {
    provider: 'anthropic',  // Global fallback
    // The model is chosen in the Tekoäly tab's settings (config.json), not here: these stay empty
    model: '',
    activeModel: '',
    batchGeneration: false,

    // Provider configuration per function
    providers: {
      generation: 'anthropic',      // Chapter/scene generation
      continuity: 'anthropic',      // Continuity checks
      analysis: 'anthropic',        // Quality analysis, synopsis
      batchProcessing: 'anthropic', // Batch operations
      characterBuilder: 'anthropic' // Character archetype building
    },

    // Model names per provider: none (CostOptimizer falls back to its own)
    models: {},

    // Writing modes
    currentMode: 'production',
    modes: {
      exploration: {
        name: 'Exploration',
        temperature: 0.9,
        maxTokens: 4096,
        systemPrompt: 'Be creative and experimental. Generate multiple variations. Try different approaches.',
        useCase: 'Ideointivaihe, kokeile vaihtoehtoja',
        color: '#B68B5C'
      },
      production: {
        name: 'Production',
        temperature: 0.7,
        maxTokens: 4096,
        systemPrompt: 'Write coherently following the outline and story consistency. Balance creativity with structure.',
        useCase: 'Normaali kirjoitus, seuraa suunnitelmaa',
        color: '#8F7A53'
      },
      polish: {
        name: 'Polish',
        temperature: 0.3,
        maxTokens: 2048,
        systemPrompt: 'Focus on grammar, style consistency, and clarity. Make minimal creative changes. Preserve the author\'s voice.',
        useCase: 'Viimeistely, johdonmukaisuus, kielioppi',
        color: '#715C38'
      }
    },

    costTracking: {
      totalSpent: 0,
      estimatedRemaining: 0,
      tokensUsed: 0,
      requestCount: 0
    }
  },
});

// ComplexityAnalyzer is now loaded from src/services/story/ComplexityAnalyzer.js as IIFE module

function FAUSTApp() {
  // Project state
  const [project, setProject] = useState(createDefaultProject);
  const [currentFilePath, setCurrentFilePath] = useState(null);
  const [activeChapterId, setActiveChapterId] = useState('chapter-1');
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [savingState, setSavingState] = useState('idle'); // 'idle', 'saving', 'saved', 'error'

  // Complexity analysis state
  const [complexity, setComplexity] = useState(null);

  // UI state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Same rule as the first-paint script in index.html: anything but 'DEIS' is NOX
    try { return localStorage.getItem('faust-theme') !== 'DEIS'; } catch (err) { return true; }
  });
  const [showInspector, setShowInspector] = useState(false);
  // Native fullscreen, reported by the main process through the menu channel ('fullscreen-changed')
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Typewriter Mode - keeps active line centered
  const [typewriterMode, setTypewriterMode] = useState(() => {
    const saved = localStorage.getItem('faust-typewriter-mode');
    return saved === 'true';
  });

  // Writing Goals per Session
  const [sessionGoal, setSessionGoal] = useState(() => {
    const saved = localStorage.getItem('faust-session-goal');
    return saved ? parseInt(saved) : 500; // Default 500 words per session
  });
  const [sessionStartWords, setSessionStartWords] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(null);

  // Timeline View state
  const [showTimelineView, setShowTimelineView] = useState(false);

  // Research Folder state
  const [showResearchFolder, setShowResearchFolder] = useState(false);
  const [showCastPlanDialog, setShowCastPlanDialog] = useState(false);
  const [castPlanStep, setCastPlanStep] = useState(1); // 1=input, 2=AI analysis, 3=review
  const [showCharacterBuilder, setShowCharacterBuilder] = useState(false);
  const [selectedCharacterType, setSelectedCharacterType] = useState(null);
  const [characterBuilderStep, setCharacterBuilderStep] = useState(1); // 1=select type, 2=input people, 3=questions, 4=AI gen, 5=review
  const [characterRealPeople, setCharacterRealPeople] = useState('');
  const [characterQuestions, setCharacterQuestions] = useState([]);
  const [characterAnswers, setCharacterAnswers] = useState({});
  const [characterProfile, setCharacterProfile] = useState(null);

  // CharacterSheet modal state (view/edit existing characters)
  const [showCharacterSheet, setShowCharacterSheet] = useState(false);

  // LocationSheet modal state
  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [showLocationFormModal, setShowLocationFormModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [locationFormMode, setLocationFormMode] = useState('create'); // 'create', 'edit', 'view'

  // ThreadSheet modal state (plot threads)
  const [showThreadSheet, setShowThreadSheet] = useState(false);
  const [showThreadFormModal, setShowThreadFormModal] = useState(false);
  const [selectedThread, setSelectedThread] = useState(null);
  const [threadFormMode, setThreadFormMode] = useState('create'); // 'create', 'edit', 'view'

  // ChapterSheet modal state
  const [showChapterSheetModal, setShowChapterSheetModal] = useState(false);

  // ExportModal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [importSource, setImportSource] = useState(null); // open import preview, see beginImport
  const [importPickError, setImportPickError] = useState(null); // a folder the open preview could not read

  // Handler to save chapter data from modal
  // A tiivistelmä the author edits here is theirs: it goes to synopsisManual too, so that
  // Analysoi luku and Tee tiivistelmä (synopsis: ch.synopsisManual || ...) keep it next time.
  const handleChapterSheetSave = (chapterData) => {
    setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === activeChapterId
          ? {
              ...ch,
              ...chapterData,
              ...(chapterData.synopsis !== undefined
                ? { synopsisManual: chapterData.synopsis !== ch.synopsisAI ? chapterData.synopsis : ch.synopsisManual }
                : {}),
              modified: new Date().toISOString()
            }
          : ch
      )
    }));
    setUnsavedChanges(true);
    setShowChapterSheetModal(false);
    console.log('[ChapterSheet] Chapter updated:', activeChapterId);
  };

  // Handler to save location data from modal
  const handleLocationSave = (locationData) => {
    if (!project.continuity) {
      project.continuity = { locations: {}, characters: {}, threads: {} };
    }
    if (!project.continuity.locations) {
      project.continuity.locations = {};
    }

    // Places are keyed by name: a renamed place leaves its old key, found by the stored object
    const locations = project.continuity.locations;
    if (locationFormMode === 'edit' && selectedLocation) {
      const oldKey = storedLocationKey(locations, selectedLocation);
      if (oldKey !== undefined && oldKey !== locationData.name) delete locations[oldKey];
    }

    // Create or update location
    locations[locationData.name] = locationData;

    setProject({ ...project });
    setUnsavedChanges(true);
    setShowLocationFormModal(false);
    setSelectedLocation(null);
    console.log('[LocationSheet] Location saved:', locationData.name);
  };

  // Handler to save thread data from modal
  const handleThreadSave = (threadData) => {
    if (!project.plotThreads) {
      project.plotThreads = [];
    }

    if (threadFormMode === 'edit' && selectedThread) {
      // Update existing thread (a thread from an old file may have no id: then the stored object)
      const threadIndex = project.plotThreads.findIndex(t => sameThread(t, selectedThread));
      if (threadIndex > -1) {
        project.plotThreads[threadIndex] = threadData;
      }
    } else {
      // Create new thread
      project.plotThreads.push(threadData);
    }

    setProject({ ...project });
    setUnsavedChanges(true);
    setShowThreadFormModal(false);
    setSelectedThread(null);
    console.log('[ThreadSheet] Thread saved:', threadData.name);
  };

  // Merge fields into the project (Ohjeet tekoälylle; later Tarinakansio)
  const patchProject = (patch) => {
    setProject(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
    setUnsavedChanges(true);
  };
  // A Tarinakansio entry's form, from a ⌘-click on its name or from Tutkimuskansio: the sidebar opens
  // (leaving focus mode first, as every docked panel does)
  const openCodexEntry = (id) => {
    if (focusMode) toggleFocusMode();
    setSidebarCollapsed(false);
    setCodexUi(s => ({ ...s, openId: id, openTick: s.openTick + 1 }));
  };

  // Delete a place from its form. Places are keyed by their stored name, not the edited one;
  // an entry whose key differs from its name (an old or hand-edited file) is found by the object.
  const deleteLocation = async (location) => {
    if (!location) return;
    if (!(await askConfirm(
      'Poistetaanko paikka?',
      'Paikka ”' + (location.name || 'Nimetön paikka') + '” poistetaan. Poistoa ei voi kumota.',
      'Poista paikka',
      'Peruuta',
      { danger: true }
    ))) return;
    setProject(prev => {
      const locations = { ...((prev.continuity && prev.continuity.locations) || {}) };
      const key = storedLocationKey(locations, location);
      if (key !== undefined) delete locations[key];
      return { ...prev, continuity: { ...(prev.continuity || {}), locations } };
    });
    setUnsavedChanges(true);
    setShowLocationFormModal(false);
    setSelectedLocation(null);
  };

  // Delete a plot thread from its form
  const deleteThread = async (thread) => {
    if (!thread) return;
    if (!(await askConfirm(
      'Poistetaanko juonilanka?',
      'Juonilanka ”' + (thread.name || 'Nimetön juonilanka') + '” poistetaan. Poistoa ei voi kumota.',
      'Poista juonilanka',
      'Peruuta',
      { danger: true }
    ))) return;
    setProject(prev => ({ ...prev, plotThreads: (prev.plotThreads || []).filter((t) => !sameThread(t, thread)) }));
    // The copy for the panels follows the project only while it has threads: keep it in step
    setPlotThreads(prev => prev.filter((t) => !sameThread(t, thread)));
    setUnsavedChanges(true);
    setShowThreadFormModal(false);
    setSelectedThread(null);
  };

  // Refinement state
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [regenerateFeedback, setRegenerateFeedback] = useState('');
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showVersionComparison, setShowVersionComparison] = useState(false);
  const [comparisonVersionId, setComparisonVersionId] = useState(null);

  // Plot thread state
  const [plotThreads, setPlotThreads] = useState([]);
  const [detectingThreads, setDetectingThreads] = useState(false);

  // HybridWritingFlow state
  const [showContinueDialog, setShowContinueDialog] = useState(false);
  const [hybridMode, setHybridMode] = useState('continue'); // 'continue', 'expand', 'rewrite', 'scene'
  const [continueParagraphs, setContinueParagraphs] = useState(2);
  const [continuePreview, setContinuePreview] = useState('');
  const [continuingWriting, setContinuingWriting] = useState(false);
  const [hybridInput, setHybridInput] = useState(''); // For outline/instructions/scene description
  const [hybridTargetWords, setHybridTargetWords] = useState(1000);
  const [hybridStyle, setHybridStyle] = useState('vivid'); // 'vivid', 'concise', 'descriptive', 'dialogue-heavy'

  // Consistency check state
  const [consistencyErrors, setConsistencyErrors] = useState([]);
  const [checkingConsistency, setCheckingConsistency] = useState(false);
  // A complete check of the open project found nothing (cleared when another project opens or an import replaces it)
  const [consistencyChecked, setConsistencyChecked] = useState(false);

  // Voice state
  const [voiceInputAvailable, setVoiceInputAvailable] = useState(false);
  const [voiceState, setVoiceState] = useState('idle'); // idle, listening, processing, error
  const [textSelection, setTextSelection] = useState(null); // { text, start, end }
  const [voiceDiffView, setVoiceDiffView] = useState(null); // { original, revised, instruction }

  // AI Assistant Chat state (Cursor-style)
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiChatVoiceState, setAiChatVoiceState] = useState('idle');

  // Scrivener-style editor controls
  // How the manuscript looks in the editor. Remembered between sessions.
  const storedEditorSetting = (key, fallback) => {
    try {
      return localStorage.getItem(`faust-editor-${key}`) || fallback;
    } catch (error) {
      return fallback;
    }
  };
  // One of the faces of MANUSCRIPT_FONTS (FaustEditor.js); a stored name it does not know falls back
  const [editorFont, setEditorFont] = useState(() => {
    const stored = storedEditorSetting('font', 'EB Garamond');
    return Object.prototype.hasOwnProperty.call(MANUSCRIPT_FONTS, stored) ? stored : 'EB Garamond';
  });
  const manuscriptFont = MANUSCRIPT_FONTS[editorFont] || MANUSCRIPT_FONTS['EB Garamond'];
  const [textAlign, setTextAlign] = useState(() => storedEditorSetting('align', 'left'));
  const [lineSpacing, setLineSpacing] = useState(() => storedEditorSetting('line-spacing', '1.8'));
  const [editorZoom, setEditorZoom] = useState(() => storedEditorSetting('zoom', '100'));
  const [paragraphSpacing, setParagraphSpacing] = useState(() => storedEditorSetting('paragraph-spacing', '1.5'));

  useEffect(() => {
    try {
      localStorage.setItem('faust-editor-font', editorFont);
      localStorage.setItem('faust-editor-align', textAlign);
      localStorage.setItem('faust-editor-line-spacing', lineSpacing);
      localStorage.setItem('faust-editor-zoom', editorZoom);
      localStorage.setItem('faust-editor-paragraph-spacing', paragraphSpacing);
    } catch (error) {
      // Storage unavailable: the settings simply last for this session
    }
  }, [editorFont, textAlign, lineSpacing, editorZoom, paragraphSpacing]);
  const [aiChatProcessing, setAiChatProcessing] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null); // { original, revised, applied }
  const [chatMemory, setChatMemory] = useState({ entries: [], lastUpdated: null });

  // Project Settings state
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  // Tarinakansio (I-07): focus asks the section to come into view, openId/openTick open an entry's form
  const [codexUi, setCodexUi] = useState({ focus: 0, openId: null, openTick: 0 });

  // Recent Files state (tracked in localStorage)
  const [recentFiles, setRecentFiles] = useState(() => {
    try {
      const stored = localStorage.getItem('faust-recent-files');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  // Viimeisimmät, Kirjanmerkit, Tilannekuvat and Etsi are popovers (R-60): usePopover gives each one
  // its press outside, its Esc and one popover open at a time; the names below are its open state.
  const recentPop = usePopover();
  const showRecentFilesMenu = recentPop.open;
  const setShowRecentFilesMenu = recentPop.setOpen;

  // Settings state

  // AI Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  // The one busy notification of a running Magnum Opus, rewrite or analysis (R-61): its handle is held
  // here, its text (and the batch progress, when the main process reports one) follows the run, and it
  // closes before the run's result is shown. Never a box above the text as well.
  const busyRef = useRef(null);
  const showBusy = (text, progress) => {
    if (!busyRef.current) busyRef.current = notify('busy', text);
    busyRef.current.update({ text, progress });
  };
  const closeBusy = () => {
    if (busyRef.current) busyRef.current.close();
    busyRef.current = null;
  };
  // Which Magnum Opus command runs (the busy face goes on its button): null | 'one' | 'all'
  const [magnumOpusRun, setMagnumOpusRun] = useState(null);
  // Which of Analysoi luku, Pika-arvio and Tee tiivistelmä runs: null | 'analyze' | 'quick' | 'summary'
  const [analysisBusy, setAnalysisBusy] = useState(null);

  // The tekoälyn lähde as the main process reports it ({ provider, model, ... }); null until known,
  // which counts as "not Cherry Studio". AIProviderSettings keeps it current (onProviderChange).
  const [aiSource, setAiSource] = useState(null);

  // Panel collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Split View state
  const [splitViewEnabled, setSplitViewEnabled] = useState(false);
  const [splitViewChapterId, setSplitViewChapterId] = useState(null);
  // Each type of the second pane keeps its own selection
  const [splitViewCharacterId, setSplitViewCharacterId] = useState(null);
  const [splitViewLocationId, setSplitViewLocationId] = useState(null);
  const [splitViewType, setSplitViewType] = useState('chapter'); // 'chapter', 'character', 'location', 'outline'

  // Corkboard state
  const [corkboardEnabled, setCorkboardEnabled] = useState(false);
  const [draggedChapterId, setDraggedChapterId] = useState(null);

  // Bookmarks state
  const bookmarksPop = usePopover();
  const showBookmarksPanel = bookmarksPop.open;
  const setShowBookmarksPanel = bookmarksPop.setOpen;

  // Snapshots state
  const snapshotsPop = usePopover();
  const showSnapshotsPanel = snapshotsPop.open;
  const setShowSnapshotsPanel = snapshotsPop.setOpen;

  const [activeCollectionId, setActiveCollectionId] = useState(null);
  const [showCollectionDialog, setShowCollectionDialog] = useState(false); // the dialog Uusi kokoelma

  // Claude Chat state
  const [claudeChatOpen, setClaudeChatOpen] = useState(false);

  // Tietopaneeli tabs: editor (Ulkoasu), chapter (Luku), project (Projekti), ai (Tekoäly), review (Tarkistus). Opens on Luku.
  const [inspectorTab, setInspectorTab] = useState('chapter');

  // Find & Replace state
  // Character sheet (list / view / edit). These two went missing in 8a68586,
  // which made the sheet throw as soon as it opened.
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [characterSheetMode, setCharacterSheetMode] = useState('list'); // 'list', 'view', 'edit'
  const findPop = usePopover();
  const showFindDialog = findPop.open;
  const setShowFindDialog = findPop.setOpen;
  const [focusMode, setFocusMode] = useState(false);
  const [, setAiUsageTick] = useState(0); // bumps a re-render when AI usage totals change
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [textPrompt, setTextPrompt] = useState(null); // open text question, see askText
  const [confirmRequest, setConfirmRequest] = useState(null); // open yes/no question, see askConfirm
  const [suggestionInfo, setSuggestionInfo] = useState(null); // the suggestion bar's BarInfo (stage I-03)
  const [pasteEditsRequest, setPasteEditsRequest] = useState(null); // open Liitä muokkauksina dialog, see pasteAsEdits (stage I-04)
  // Kielen työkalut, the third panel of the right column: null or the tab it shows (stage I-06)
  const [languagePanel, setLanguagePanel] = useState(null);
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [searchInAllChapters, setSearchInAllChapters] = useState(false);
  const [searchGlobally, setSearchGlobally] = useState(false); // Search in chapters, characters, locations, threads
  const [searchResults, setSearchResults] = useState([]); // Array of {type, start, end, text, chapterId, chapterTitle, itemId, itemName}
  const [currentSearchIndex, setCurrentSearchIndex] = useState(-1);
  // The regular expression in the find field does not compile (shown under the field)
  const [findPatternError, setFindPatternError] = useState(false);
  const [searchHistory, setSearchHistory] = useState(() => {
    const saved = localStorage.getItem('faust-search-history');
    return saved ? JSON.parse(saved) : [];
  });

  const editorRef = useRef(null);
  const liveContentRef = useRef({ chapterId: null, content: '' }); // see updateChapterContent
  const projectRef = useRef(null);            // the project of the latest render, for timers and async saves
  // Tarinakansio's form writes typed text 300 ms after the last key: a save writes that batch first
  // ({ flush, pending }, set by CodexPanel), so the file and the "saved" state never miss it
  const codexDraftsRef = useRef(null);
  const flushCodexDrafts = () => { if (codexDraftsRef.current) ReactDOM.flushSync(() => codexDraftsRef.current.flush()); };
  const codexDraftsPending = () => !!(codexDraftsRef.current && codexDraftsRef.current.pending());
  const callAIRef = useRef(null);             // the callAIWithMode of the latest render, for long-lived services
  const refusalRef = useRef(null);            // the last old request that main refused or stopped, see asIsNotice
  const menuHandlerRef = useRef(null);        // see the menu handler
  const quickEditRef = useRef(null);          // Pikamuokkaus (Cmd+K): the quick-edit controller, created below
  // Kielenhuolto's suspect-word guard: Voikko, else the system spell checker, else none (refreshed at start)
  const wordCheckRef = useRef(null);
  if (!wordCheckRef.current) wordCheckRef.current = createWordCheck(window.electronAPI || {});
  const explainCacheRef = useRef(new Map()); // Miksi? asks once per change in a project
  const rightDisplacedRef = useRef(false);    // Kielen työkalut closed Tietopaneeli: its Sulje brings it back
  const lastSearchRef = useRef('');           // the term the current search results belong to
  const panelsBeforeFocusRef = useRef(null);  // panel visibility to restore after focus mode
  const [focusExitIdle, setFocusExitIdle] = useState(false); // the exit button fades after 2 s without pointer movement
  const [autosaveError, setAutosaveError] = useState(null);
  const voiceInputRef = useRef(null);
  // Who listens through the one shared VoiceInput: 'editor' (Muokkaa valintaa puhumalla) or 'engine'
  // (the Liminal Engine's dictation). Only the owner shows listening (lead decision 4 of 18 Nov 2026).
  const voiceOwnerRef = useRef(null);

  // Suunnittele hahmot: the text of the field Hahmotyypit, kept across steps and pre-filled on reopen
  const [castTypesDraft, setCastTypesDraft] = useState('');
  // A request whose dialog was closed or reopened meanwhile is dropped: each run takes a number,
  // and only the current number may write its result.
  const castPlanRunRef = useRef(0);
  const castPlanOpenRef = useRef(false);
  castPlanOpenRef.current = showCastPlanDialog;
  const builderRunRef = useRef(0);             // the same for Uusi hahmo (questions and profile)
  const builderOpenRef = useRef(false);
  builderOpenRef.current = showCharacterBuilder;

  // The undo history exists from the first keystroke; the suggestion controller keeps the chapters'
  // suggestions; the project epoch ties both, the editor and the usage log to the open project (contracts 4.4)
  const commandManagerRef = useRef(null);
  if (!commandManagerRef.current) commandManagerRef.current = new CommandManager();
  const suggestionsRef = useRef(null);
  if (!suggestionsRef.current) suggestionsRef.current = createSuggestionController({ wordDiff, rawDiff: (a, b) => wordDiff(a, b, { raw: true }), changeRatio });
  // Tarkistus (stage I-08): the review controller keeps the running check, the selected check, the filter and
  // the selected finding while the tab is hidden; a change in it renders the app again (the tick)
  const reviewRef = useRef(null);
  if (!reviewRef.current) reviewRef.current = createDefaultReviewController();
  const [, setReviewTick] = useState(0);
  const [reviewCheckRequest, setReviewCheckRequest] = useState(null);    // Oma tarkistus: { check } or null
  const [reviewCustomChecks] = useSetting('review.customChecks', []);
  const projectEpochRef = useRef(0);
  const [projectEpoch, setProjectEpoch] = useState(0);
  // What the old paths SENT to the model (sentTarget: chapter, text, offsets, project epoch), stored
  // together with the result it answers, so that result goes back there and nowhere else
  const oldPathTargetRef = useRef({ voice: null, rewrite: null, liminal: null });

  // AI Modules refs
  const batchProcessorRef = useRef(null);
  const bookRunRef = useRef(false);             // a whole-book run is under way: the processor reads bookRunPlan(project).lent
  const costOptimizerRef = useRef(null);
  const continuityTrackerRef = useRef(null);
  const hybridFlowRef = useRef(null);
  const refinementManagerRef = useRef(null);
  const plotThreadTrackerRef = useRef(null);
  const consistencyCheckerRef = useRef(null);

  // Get active chapter
  const activeChapter = project.structure.find(ch => ch.id === activeChapterId) || project.structure[0];

  // "Tekoäly pois" and "Ei tekoälylle" (contracts.md section 6), defined once:
  // aiDisabled hides every AI entry point (also while the setting is not known yet); aiHidden adds
  // focus mode for the sigil bar only; chapterNoAI is the open chapter marked "Ei tekoälylle"
  const [aiOff, , prefsLoaded] = useSetting('aiOff', false);
  // Älykäs kirjoitus (Tietopaneeli ▸ Ulkoasu), in ui-prefs.json
  const [smartTypingOn, setSmartTypingOn] = useSetting('typo.smartTyping', true);
  // The two marks of the manuscript, switched in Näytä (I-07)
  const [highlightAvoid] = useSetting('context.highlightAvoidWords', true);
  const [underlineMentions] = useSetting('context.underlineMentions', true);
  const aiDisabled = !prefsLoaded || aiOff;
  const aiHidden = aiDisabled || focusMode;
  const chapterNoAI = !!(activeChapter && activeChapter.noAI);

  // Content of the active chapter as of this render. updateChapterContent keeps
  // it current between renders, because fast typing can outrun React state.
  liveContentRef.current = { chapterId: activeChapter?.id, content: activeChapter?.content || '' };
  projectRef.current = project;
  // Pikamuokkaus reads the editor, the project and the suggestion controller through these getters
  if (!quickEditRef.current) {
    quickEditRef.current = setupQuickEdit({
      getEditor: () => editorRef.current,
      getProject: () => projectRef.current,
      getChapterId: () => liveContentRef.current.chapterId,
      getController: () => suggestionsRef.current,
      // The chip Kielenhuolto – vain virheet guards against a model's typo with the same word list (I-06)
      getWordCheck: () => wordCheckRef.current,
      // Kirjoita kohdistimeen (I-09): Cmd+K without a selection writes a draft into an insert block at the caret
      writeAtCursor: true,
      // Deleting a saved prompt asks first; askConfirm is declared further down and called only later
      askConfirm: (...args) => askConfirm(...args)
    });
  }
  // The wire guard in main learns the text of the chapters marked "Ei tekoälylle"; the file path
  // tells it another project was opened, which is sent at once even when the chapter ids repeat
  useNoAIGuard(project, currentFilePath);
  // Vältettävät sanat and the Tarinakansio mentions in the manuscript: a new object only when a list or a switch changed
  const termHighlights = useMemo(() => ({
    avoid: highlightAvoid ? project.avoidWords : [],
    codex: underlineMentions ? project.codex : []
  }), [project.avoidWords, project.codex, highlightAvoid, underlineMentions]);

  // A selection belongs to the chapter it was made in: another chapter or project starts without one,
  // so the selected text of a chapter marked "Ei tekoälylle" cannot follow the author elsewhere
  useEffect(() => {
    setTextSelection(null);
  }, [activeChapter && activeChapter.id, currentFilePath, project.created]);

  // The active chapter id must always name a chapter that exists. After a
  // delete, a snapshot restore or a jump to an old bookmark it could point at
  // nothing: the editor then showed the first chapter while edits were written
  // to the missing id and silently lost.
  useEffect(() => {
    if (project.structure.length > 0 && !project.structure.some(ch => ch.id === activeChapterId)) {
      setActiveChapterId(project.structure[0].id);
    }
  }, [project.structure, activeChapterId]);

  // Counts are computed from the text on every render: a stored total goes stale
  const totalWords = countProjectWords(project.structure);
  const chapterWords = countWords(activeChapter?.content);
  const chapterCharacters = countCharacters(activeChapter?.content);
  const activeChapterIndex = project.structure.findIndex(ch => ch.id === activeChapterId);

  // Apply theme: at once on the first run, with the swipe when the author switches
  const themeAppliedRef = useRef(false);
  useEffect(() => {
    const theme = isDarkMode ? 'NOX' : 'DEIS';
    applyTheme(theme, themeAppliedRef.current);
    themeAppliedRef.current = true;
    console.log(`[Theme] ${theme}`);
  }, [isDarkMode]);

  // Scrollbar width for the page's left edge: at start and whenever the window gets focus
  // (attaching a mouse turns overlay scrollbars into classic ones)
  useEffect(() => {
    measureScrollbar();
    window.addEventListener('focus', measureScrollbar);
    return () => window.removeEventListener('focus', measureScrollbar);
  }, []);

  // Sync plot threads from project
  useEffect(() => {
    if (project.plotThreads && project.plotThreads.length > 0) {
      setPlotThreads(project.plotThreads);
    }
  }, [project.plotThreads]);

  // The one AI client: its settings are read at start (window.faustAI for DevTools checks)
  // A usage row reaches only the project its request started in (the scope is the project epoch)
  useEffect(() => {
    const ai = getAIClient();
    window.faustAI = ai;
    ai.refreshConfig();
    ai.setScopeSource(() => projectEpochRef.current);
    ai.setUsageSink(appendAiLog);
    return () => { ai.setUsageSink(null); ai.setScopeSource(null); };
  }, []);

  // Which word list Kielenhuolto's guard has: the Voikko status is an invoke, so it is awaited once here
  useEffect(() => { wordCheckRef.current.refresh(); }, []);

  // The tekoälyn lähde once at start-up (AIProviderSettings reports later changes)
  useEffect(() => {
    if (!window.electronAPI || !window.electronAPI.aiGetProvider) return;
    let cancelled = false;
    window.electronAPI.aiGetProvider()
      .then((result) => {
        if (cancelled || !result || !result.success) return;
        const config = { ...result };
        delete config.success;
        setAiSource(config);
      })
      .catch((error) => console.error('[AI Source] Load error:', error));
    return () => { cancelled = true; };
  }, []);

  // Listen for batch progress updates
  useEffect(() => {
    if (!window.electronAPI?.onBatchProgress) return;

    const cleanup = window.electronAPI.onBatchProgress((progress) => {
      console.log('[Batch Progress]', progress);
      showBusy(
        progress.message || `Magnum Opus: tekoäly kirjoittaa lukua ${progress.current}/${progress.total}…`,
        progress.percentage > 0 ? progress.percentage : undefined
      );

      // Clear progress when complete
      if (progress.current >= progress.total) {
        setTimeout(closeBusy, 2000);
      }
    });

    return cleanup;
  }, []);

  // Update complexity analysis when project changes
  useEffect(() => {
    const analysis = window.ComplexityAnalyzer.analyze(project);
    setComplexity(analysis);
    console.log('[Complexity] Score:', analysis.score, 'Phase:', analysis.phase);
  }, [project.structure, project.characters]);

  // Esc closes the topmost layer only (R-70). The layers that are components close themselves
  // first and stop the key: dialogs and questions through the layer stack (capture phase on
  // window), the inline prompt and the editor's own keys, the focused element, then popovers and
  // menus (bubble phase on document). What reaches this handler closes one of the app's own
  // layers, nearest first: the voice comparison (as Hylkää), the keskustelu, the Liminal Engine
  // panel, and last Keskittymistila. The handler lives in a ref that every render refreshes, so
  // the listener is registered once and needs no list of states.
  // A panel that closes with the focus inside it gives the focus to the manuscript; otherwise the
  // focus would fall to the body and the next keys would go nowhere.
  const closePanelKeepingFocus = (selector, close) => {
    const active = document.activeElement;
    const inside = !!(active && active.closest && active.closest(selector));
    close();
    if (inside && editorRef.current) editorRef.current.focus();
  };
  const handleEscapeRef = useRef(null);
  handleEscapeRef.current = (event) => {
    if (event.defaultPrevented || layerStack.size() > 0 || textPrompt || confirmRequest) return;
    if (voiceDiffView) rejectVoiceEdit();
    else if (claudeChatOpen && !aiAssistantOpen && !aiDisabled) closePanelKeepingFocus('.claude-chat-container', () => setClaudeChatOpen(false));
    else if (aiAssistantOpen && !aiDisabled) closePanelKeepingFocus('.faust-aipanel', () => setAiAssistantOpen(false));
    else if (focusMode) toggleFocusMode();
    else return;
    event.preventDefault();
  };
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' || event.keyCode === 27) handleEscapeRef.current(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Menu events. The IPC listener is registered once, so it calls through a
  // ref that always holds the handler of the latest render. A handler captured
  // at mount would keep seeing the first render's empty project.
  menuHandlerRef.current = (action, arg) => {
    // While an instruction is typed in the Pikamuokkaus prompt, Cmd+B and the like must not change the manuscript
    if (quickEditRef.current && quickEditRef.current.blocksMenuAction(action)) return;
    // A command that shows a docked panel leaves focus mode first, then shows its panel (never hides it)
    const wasFocus = focusMode && LEAVES_FOCUS.includes(action);
    if (wasFocus) toggleFocusMode();

    switch (action) {
      // File
      case 'new-project': newProject(); break;
      case 'open-project': loadProject(); break;
      case 'save-project': saveProject(); break;
      case 'save-project-as': saveProject({ saveAs: true }); break;
      case 'save-and-close': saveAndClose(); break;
      case 'import-document': beginImport('file'); break;
      case 'import-folder': beginImport('folder'); break;
      case 'show-export': setShowExportModal(true); break;
      case 'print': printManuscript(); break;
      case 'show-snapshots': setShowSnapshotsPanel(true); break;

      // Edit
      case 'undo': undo(); break;
      case 'redo': redo(); break;
      case 'show-find':
        setShowFindDialog(true);
        setShowReplaceDialog(false);
        break;
      case 'find-next': findNext(); break;
      case 'find-previous': findPrevious(); break;
      case 'show-find-replace':
        setShowFindDialog(true);
        setShowReplaceDialog(true);
        break;
      // Muokkaa ▸ Liitä muokkauksina…: arg is the clipboard text, read in main when the item was chosen
      case 'paste-as-edits': suggestionsRef.current.pasteAsEdits(arg); break;
      case 'suggestion': suggestionsRef.current.menuCommand(arg); break;

      // Format
      case 'format-bold': formatBold(); break;
      case 'format-italic': formatItalic(); break;
      case 'format-underline': formatUnderline(); break;
      case 'format-strikethrough': formatStrikethrough(); break;
      case 'format-heading': formatHeading(arg || 0); break;
      case 'format-quote': formatQuote(); break;
      case 'format-list': formatList(); break;
      case 'format-numbered-list': formatNumberedList(); break;
      case 'text-uppercase': transformSelectedText(text => text.toUpperCase()); break;
      case 'text-lowercase': transformSelectedText(text => text.toLowerCase()); break;
      case 'text-trim-spaces': transformChapterText(trimSpaces); break;
      case 'text-remove-empty-lines': transformChapterText(collapseEmptyLines); break;

      // Insert
      case 'new-chapter': addChapter(); break;
      case 'insert-text': insertAtCursor(arg); break;
      case 'insert-todo': insertTodo(); break;
      case 'add-bookmark': askAndAddBookmark(); break;

      // View
      case 'toggle-sidebar': wasFocus ? setSidebarCollapsed(false) : setSidebarCollapsed(prev => !prev); break;
      case 'toggle-inspector': if (!wasFocus && showInspector) setShowInspector(false); else showInspectorTab(); break;
      // Näytä ▸ Tarkistus (⌘3): pressed again while the tab is showing, it hides Tietopaneeli
      case 'show-review': if (!wasFocus && showInspector && inspectorTab === 'review') setShowInspector(false); else showInspectorTab('review'); break;
      case 'toggle-ai-panel': if (wasFocus || !aiAssistantOpen) openLiminalEngine(); else setAiAssistantOpen(false); break;
      // Muokkaa ▸ Pikamuokkaus… (Cmd+K) and the right-click Tekoäly submenu (arg: the action id or 'custom')
      case 'quick-edit': quickEditRef.current.open(); break;
      case 'ai-action': quickEditRef.current.open({ actionId: arg, requireSelection: true }); break;
      case 'toggle-chat-window': if (wasFocus || !claudeChatOpen) openChat(); else setClaudeChatOpen(false); break;
      case 'toggle-corkboard': wasFocus ? setCorkboardEnabled(true) : setCorkboardEnabled(prev => !prev); break;
      case 'toggle-split-view': if (wasFocus) { setCorkboardEnabled(false); if (!splitViewEnabled) openSplitView(); } else toggleSplitView(); break;
      case 'toggle-bookmarks': wasFocus ? setShowBookmarksPanel(true) : setShowBookmarksPanel(prev => !prev); break;
      case 'toggle-focus-mode': toggleFocusMode(); break;
      case 'toggle-typewriter': setTypewriterMode(prev => !prev); break;
      case 'zoom-in': changeZoom(10); break;
      case 'zoom-out': changeZoom(-10); break;
      case 'zoom-reset': setEditorZoom('100'); break;
      case 'toggle-theme': setIsDarkMode(prev => !prev); break;

      // Tools
      case 'show-characters': openCharacterList(); break;
      case 'show-locations': setShowLocationSheet(true); break;
      case 'show-threads': setShowThreadSheet(true); break;
      case 'show-timeline': setShowTimelineView(prev => !prev); break;
      case 'show-research': setShowResearchFolder(prev => !prev); break;
      case 'show-codex': setSidebarCollapsed(false); setCodexUi(s => ({ ...s, focus: s.focus + 1 })); break;
      case 'show-cast-plan': openCastPlan(); break;
      case 'show-character-builder': openCharacterBuilder(); break;
      case 'show-version-history': if (activeChapter) setShowVersionHistory(true); break;

      // Tools ▸ Tekoäly (the functions carry the busy, text-length and readiness guards themselves)
      case 'ai-analyze': runAnalyze(); break;
      case 'ai-quick-check': runQuickCheck(); break;
      case 'ai-summary': runSummary(); break;
      case 'magnum-opus-chapter': if (activeChapter) generateChapter(activeChapter.id); break;
      case 'magnum-opus-all': askAndGenerateAllChapters(); break;
      case 'show-ai-writing': openAiWriting(); break;
      case 'voice-edit': if (voiceState === 'idle') handleVoiceEdit(); break;
      case 'show-ai-settings': openAISettings(); break;
      // Kielen työkalut (I-06): each shows its tab; with "Tekoäly pois" the menu has no Kielenhuolto…
      case 'check-typography': setLanguagePanel('typography'); break;
      case 'proofread-chapter': setLanguagePanel('proofread'); break;
      case 'voikko-check-chapter': setLanguagePanel('voikko'); break;
      case 'voikko-help': setLanguagePanel('voikko'); break;

      // Pysäytä tekoäly: main has already stopped its requests; the client stops its own handles
      case 'ai-stop-all': getAIClient().cancelAll(); break;

      // Settings and help
      case 'show-settings': showInspectorTab('editor'); break;
      case 'show-project-settings': setShowProjectSettings(true); break;
      case 'show-shortcuts': setShowShortcuts(true); break;

      // Window state from the main process (the menu channel is the only one it has)
      case 'fullscreen-changed': setIsFullScreen(!!arg); break;

      default:
        console.warn('[Menu] Unhandled action:', action);
    }
  };

  useEffect(() => {
    if (!window.electronAPI || !window.electronAPI.onMenuAction) return;

    window.electronAPI.onMenuAction((action, arg) => {
      if (menuHandlerRef.current) menuHandlerRef.current(action, arg);
    });
  }, []);

  // NEW: Update chapter content using Command Pattern
  // meta (memory only): { noMerge: true, suggestions? } makes an AI write its own undo step (contracts 1.1)
  const updateChapterContent = (newContent, skipHistory = false, meta = null) => {
    if (!activeChapter) return;

    // Use the live content, not the rendered state: two keystrokes can arrive
    // before React re-renders, and undo must restore exactly what was there
    const live = liveContentRef.current;
    const oldContent = live.chapterId === activeChapter.id ? live.content : (activeChapter.content || '');

    // Don't create command if content hasn't changed
    if (oldContent === newContent) return;

    liveContentRef.current = { chapterId: activeChapter.id, content: newContent };

    // Use Command Pattern for undo/redo
    if (!skipHistory && commandManagerRef.current && window.UpdateContentCommand) {
      const command = new window.UpdateContentCommand(
        setProject,
        activeChapter.id,
        oldContent,
        newContent,
        meta
      );
      commandManagerRef.current.execute(command);
    } else {
      // Fallback: direct update
      const words = newContent.trim().split(/\s+/).filter(w => w.length > 0);
      setProject(prev => ({
        ...prev,
        structure: prev.structure.map(ch =>
          ch.id === activeChapter.id
            ? { ...ch, content: newContent, wordCount: words.length }
            : ch
        )
      }));
    }

    setUnsavedChanges(true);
  };

  // ---------------------------------------------------------------------
  // Text formatting. The text carries Markdown-style markers; the logic is in
  // src/editor/textTools.js. Every change goes through applyEdit, so it lands
  // in the undo history and the selection ends up where the user expects.
  // ---------------------------------------------------------------------

  // Run a textTools function on the editor's text and selection
  const applyEdit = (edit) => {
    const editor = editorRef.current;
    if (!editor) return;

    const result = edit(editor.value, editor.selectionStart, editor.selectionEnd);
    if (!result) {
      editor.focus();
      return;
    }

    updateChapterContent(result.text);
    // The editor picks the new text up on the next render: select after that
    setTimeout(() => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      editorRef.current.setSelectionRange(result.selStart, result.selEnd);
    }, 0);
  };

  const formatBold = () => applyEdit((text, start, end) => toggleInline(text, start, end, '**'));
  const formatItalic = () => applyEdit((text, start, end) => toggleInline(text, start, end, '_'));
  const formatUnderline = () => applyEdit((text, start, end) => toggleInline(text, start, end, '<u>', '</u>'));
  const formatStrikethrough = () => applyEdit((text, start, end) => toggleInline(text, start, end, '~~'));

  // level 0 turns the line back into body text
  const formatHeading = (level) => applyEdit((text, start, end) => setHeading(text, start, end, level));
  const formatQuote = () => applyEdit((text, start, end) => toggleLinePrefix(text, start, end, 'quote'));
  const formatList = () => applyEdit((text, start, end) => toggleLinePrefix(text, start, end, 'bullet'));
  const formatNumberedList = () => applyEdit((text, start, end) => toggleLinePrefix(text, start, end, 'numbered'));

  // Insert text at the cursor, replacing the selection
  const insertAtCursor = (insert) => applyEdit((text, start, end) => insertText(text, start, end, insert));

  // Apply a function to the selected text
  const transformSelectedText = (transform) => applyEdit((text, start, end) => transformSelection(text, start, end, transform));

  // Apply a function to the whole chapter, keeping the cursor roughly in place
  const transformChapterText = (transform) => applyEdit((text, start) => {
    const next = transform(text);
    if (next === text) return null;
    const cursor = Math.min(start, next.length);
    return { text: next, selStart: cursor, selEnd: cursor };
  });

  // A note to self in the text: [TODO: ...]
  const insertTodo = () => applyEdit((text, start, end) => {
    const selected = text.slice(Math.min(start, end), Math.max(start, end));
    const from = Math.min(start, end);
    const note = `[TODO: ${selected}]`;
    const cursor = selected ? from + note.length : from + '[TODO: '.length;
    return { text: text.slice(0, from) + note + text.slice(Math.max(start, end)), selStart: cursor, selEnd: cursor };
  });

  // Editor zoom in steps (the Inspector's Zoom control shows the same value)
  const changeZoom = (delta) => {
    setEditorZoom(prev => String(Math.max(50, Math.min(200, (parseInt(prev, 10) || 100) + delta))));
  };

  // Focus mode: only the text. Leaving it brings the panels back as they were.
  const toggleFocusMode = () => {
    if (!focusMode) {
      panelsBeforeFocusRef.current = { sidebarCollapsed, showInspector, aiAssistantOpen, claudeChatOpen, corkboardEnabled, languagePanel };
      setSidebarCollapsed(true);
      setShowInspector(false);
      setAiAssistantOpen(false);
      setClaudeChatOpen(false);
      setCorkboardEnabled(false);
      setLanguagePanel(null);       // a Kielenhuolto run goes on: the panel stays mounted
      setFocusMode(true);
    } else {
      const before = panelsBeforeFocusRef.current || {};
      setSidebarCollapsed(!!before.sidebarCollapsed);
      setShowInspector(!!before.showInspector);
      setAiAssistantOpen(!!before.aiAssistantOpen);
      setClaudeChatOpen(!!before.claudeChatOpen);
      setCorkboardEnabled(!!before.corkboardEnabled);
      setLanguagePanel(before.languagePanel || null);
      setFocusMode(false);
    }
  };

  // In focus mode the exit button fades after 2 s without pointer movement and comes back on the next one
  useEffect(() => {
    if (!focusMode) {
      setFocusExitIdle(false);
      return undefined;
    }
    let timer = null;
    const wake = () => {
      setFocusExitIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setFocusExitIdle(true), 2000);
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
    };
  }, [focusMode]);

  // Show Tietopaneeli, optionally on one tab. Only opens; the two toggles (⌘2 and the header
  // button) close it themselves when it is already shown.
  const showInspectorTab = (tab) => {
    setShowInspector(true);
    if (tab) setInspectorTab(tab);
  };

  // AI source, keys and model live on Tietopaneeli's Tekoäly tab
  const openAISettings = () => showInspectorTab('ai');

  // The Liminal Engine panel and the keskustelu are never open together
  const openLiminalEngine = () => { setClaudeChatOpen(false); setAiAssistantOpen(true); };
  const openChat = () => { setAiAssistantOpen(false); setClaudeChatOpen(true); };

  // Sulje of Kielen työkalut (Esc is not bound: a reviewed set is never thrown away by a key). When the
  // panel had taken Tietopaneeli's place (opened from the Tarkistus tab's foot), Tietopaneeli comes back
  // on the tab it showed; a panel closed because another opened is not reopened otherwise.
  const closeLanguagePanel = () => {
    const giveBack = rightDisplacedRef.current;
    rightDisplacedRef.current = false;
    closePanelKeepingFocus('.faust-langpanel', () => setLanguagePanel(null));
    if (giveBack) showInspectorTab();
  };

  // The header's "more" menu holds the priority-3 commands, which the header shows below 1120 px only
  // there. It closes when its button is hidden (a wider window, focus mode).
  const headerMore = usePopover();
  useEffect(() => {
    const anchor = headerMore.anchorRef.current;
    if (headerMore.open && (!anchor || anchor.getClientRects().length === 0)) headerMore.close();
  });

  // A popover that asks a question (askText, askConfirm) stays open under it: a press in the question
  // is not a press outside the popover, and the popover shows the result when the question is answered.
  const closeUnlessAsking = (close) => () => { if (!textPrompt && !confirmRequest) close(); };

  // The format bar's "more" menu lists the groups that the bar's container rules have hidden, as
  // they were when it opened. It closes when the bar changes width (the hidden set may change with
  // it) and when its button is hidden (focus mode, the card view).
  const formatMore = usePopover();
  const formatBarRef = useRef(null);
  useEffect(() => {
    const anchor = formatMore.anchorRef.current;
    if (formatMore.open && (!anchor || anchor.getClientRects().length === 0)) formatMore.close();
  });
  useEffect(() => {
    const bar = formatBarRef.current;
    if (!formatMore.open || !bar || typeof ResizeObserver === 'undefined') return undefined;
    const openedAt = bar.clientWidth;
    const observer = new ResizeObserver(() => { if (bar.clientWidth !== openedAt) formatMore.close(); });
    observer.observe(bar);
    return () => observer.disconnect();
  }, [formatMore.open]);

  // Kirjanmerkit and Etsi hang from their format bar buttons. While the bar's container rules hide
  // those buttons (a narrow bar, a split pane) they hang from the bar's "more" button, whose menu
  // lists them, so they open over their own pane; when neither button has a box (focus mode, the
  // card view) Popover takes its fallback place (R-60).
  const shownElement = (ref) => (ref.current && ref.current.getClientRects().length > 0 ? ref.current : null);
  const formatBarAnchor = (ownRef) => ({
    get current() { return shownElement(ownRef) || shownElement(formatMore.anchorRef) || ownRef.current; }
  });

  // Pika-arvio and Tee tiivistelmä show their result in a popover under the tile that started them
  // (R-61, MV-84). When that tile has no box (focus mode, the card view) or another chapter is open by
  // then, the result is a notification that stays until closed instead. Never both, and never a popover
  // at the fallback place: an open result closes when its tile loses its box or the chapter changes.
  const resultPop = usePopover();
  const [sigilResult, setSigilResult] = useState(null); // { kind: 'quick' | 'summary', chapterId, score, suggestions, synopsis }
  const sigilBarRef = useRef(null);
  const resultFocusRef = useRef(null);
  const sigilTile = (kind) => {
    const tile = sigilBarRef.current &&
      sigilBarRef.current.querySelector(`[aria-label="${kind === 'quick' ? 'Pika-arvio' : 'Tee tiivistelmä'}"]`);
    return tile && tile.getClientRects().length > 0 ? tile : null;
  };
  const formatScore = (score) => Number(score).toLocaleString('fi-FI', { maximumFractionDigits: 1 });
  const showSigilResult = (result) => {
    if (liveContentRef.current.chapterId !== result.chapterId || !sigilTile(result.kind)) {
      if (result.kind === 'quick') {
        notify('success', `Pika-arvio valmis. Laatuarvio: ${formatScore(result.score)}/10.`, { duration: 0 });
      } else {
        notify('success', 'Tiivistelmä valmis', {
          detail: result.synopsis + '\n\nSe näkyy myös luvun kortissa korttinäkymässä.',
          duration: 0
        });
      }
      return;
    }
    // A result that arrives while the author types does not take the caret out of the field
    const active = document.activeElement;
    resultFocusRef.current = active && active.matches && active.matches('input, textarea, [contenteditable="true"]') ? active : null;
    setSigilResult(result);
    resultPop.setOpen(true);
  };
  useEffect(() => {
    const keep = resultFocusRef.current;
    resultFocusRef.current = null;
    if (!resultPop.open || !keep || !document.contains(keep) || document.activeElement === keep) return;
    if (keep.closest('.cm-editor') && editorRef.current) editorRef.current.focus();
    else keep.focus();
  }, [resultPop.open, sigilResult]);
  useEffect(() => {
    if (resultPop.open && (!sigilResult || sigilResult.chapterId !== (activeChapter && activeChapter.id) || !sigilTile(sigilResult.kind))) {
      resultPop.close();
    }
  });

  // The right column holds one docked panel: Tietopaneeli, the Liminal Engine or Kielen työkalut (R-42). The panel
  // opened last stays and closes the other; closing one reopens nothing. Leaving focus mode restores
  // the panels as they were before it, so that render is compared with that state: a command given in
  // focus mode (⌘2, ⇧⌘K) then counts as the panel opened last, not the one the restore brought back.
  // The Liminal Engine is open only while AI is on (R-28): with "Tekoäly pois" it takes no room
  const engineShown = aiAssistantOpen && !aiDisabled;
  const rightNow = { inspector: showInspector, engine: engineShown, language: !!languagePanel };
  const rightPrevRef = useRef(rightNow);
  const rightFocusRef = useRef(focusMode);
  useLayoutEffect(() => {
    const before = rightFocusRef.current && !focusMode ? (panelsBeforeFocusRef.current || {}) : null;
    const prev = before
      ? { inspector: !!before.showInspector, engine: !!before.aiAssistantOpen, language: !!before.languagePanel }
      : rightPrevRef.current;
    const opened = Object.keys(rightNow).find((key) => rightNow[key] && !prev[key]);
    if (opened) {
      if (opened !== 'inspector' && rightNow.inspector) setShowInspector(false);
      if (opened !== 'engine' && rightNow.engine) setAiAssistantOpen(false);
      if (opened !== 'language' && rightNow.language) setLanguagePanel(null);
      // Kielen työkalut remembers whether it took Tietopaneeli's place (its Sulje gives the place back);
      // any other panel that opens forgets it
      rightDisplacedRef.current = opened === 'language' ? !!rightNow.inspector : false;
    }
    rightPrevRef.current = rightNow;
    rightFocusRef.current = focusMode;
  });
  const rightColumnOpen = rightNow.inspector || rightNow.engine || rightNow.language;
  // Switching "Tekoäly pois" on closes the Liminal Engine and the keskustelu (their conversations stay),
  // so that switching it off again opens nothing by itself
  useEffect(() => {
    if (!aiOff) return;
    if (aiAssistantOpen) setAiAssistantOpen(false);
    if (claudeChatOpen) setClaudeChatOpen(false);
    // An open Pikamuokkaus prompt goes too (its request is stopped); its suggestions stay in the text
    if (quickEditRef.current) quickEditRef.current.cancelAll();
  }, [aiOff]);

  // Panels and the window width (R-45, V 6.2). Below 1200 px one side panel is open at a time: opening
  // either side closes the other and the one opened last stays; when the right column closes, a sidebar
  // that this rule closed comes back. Turning split view on closes the right column below 1400 px and
  // also the sidebar below 1120 px; while it is on, the one-side rule holds below 1400 px (V 6.2: two
  // panes of 400 px). It acts only through the panels' own setters, so the header toggles
  // tell the truth, and it does nothing in focus mode, which closes and restores the panels itself (the
  // render that leaves focus mode is compared with the state before it, as in the effect above).
  const widthBand = (width) => [1120, 1200, 1400].filter((limit) => width >= limit).length;
  const [, setWidthBand] = useState(() => widthBand(window.innerWidth));
  useEffect(() => {
    // Renders again only when the window crosses one of the three widths
    const onResize = () => setWidthBand(widthBand(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const sidesNow = { left: !sidebarCollapsed, right: rightColumnOpen, split: splitViewEnabled && !corkboardEnabled };
  const sidesPrevRef = useRef(sidesNow);
  const sidesFocusRef = useRef(focusMode);
  const lastSideRef = useRef('left');                // the side opened last
  const sidebarClosedByWidthRef = useRef(false);     // the sidebar this rule closed, to bring back
  useLayoutEffect(() => {
    const leavingFocus = sidesFocusRef.current && !focusMode;
    sidesFocusRef.current = focusMode;
    let prev = sidesPrevRef.current;
    sidesPrevRef.current = sidesNow;
    if (focusMode) return;
    if (leavingFocus) {
      const before = panelsBeforeFocusRef.current || {};
      prev = { left: !before.sidebarCollapsed, right: !!(before.showInspector || before.aiAssistantOpen || before.languagePanel), split: sidesNow.split };
    }
    const width = window.innerWidth;
    const closeRightColumn = () => { setShowInspector(false); setAiAssistantOpen(false); setLanguagePanel(null); };
    if (sidesNow.left && !prev.left) { lastSideRef.current = 'left'; sidebarClosedByWidthRef.current = false; }
    if (sidesNow.right && !prev.right) lastSideRef.current = 'right';
    if (sidesNow.split && !prev.split && width < 1400) {
      if (sidesNow.right) closeRightColumn();
      if (width < 1120) {
        if (sidesNow.left) setSidebarCollapsed(true);
        sidebarClosedByWidthRef.current = false;   // split view needs the room: the sidebar stays closed
      }
      return;
    }
    // Split view and the right column never share a window under 1400 px (V 6.2: the two panes need
    // 800 px). The one opened last stays: opening the right column closes split view; a window made
    // narrower with both open keeps split view, which closes the right column as when it was turned on.
    if (sidesNow.split && sidesNow.right && width < 1400) {
      if (!prev.right) setSplitViewEnabled(false);
      else closeRightColumn();
      return;
    }
    // While split view is on, its two panes need 800 px: the one-side rule then holds below 1400 px
    if (width < (sidesNow.split ? 1400 : 1200) && sidesNow.left && sidesNow.right) {
      if (lastSideRef.current === 'left') closeRightColumn();
      else { setSidebarCollapsed(true); sidebarClosedByWidthRef.current = true; }
      return;
    }
    if (prev.right && !sidesNow.right && !sidesNow.left && sidebarClosedByWidthRef.current) {
      sidebarClosedByWidthRef.current = false;
      setSidebarCollapsed(false);
    }
  });

  // Jaettu näkymä. Opening shows a chapter other than the open one, as the header button always
  // did; the second pane also opens in a one-chapter project, where it shows that chapter.
  const openSplitView = () => {
    const other = project.structure.find(ch => ch.id !== activeChapterId) || project.structure[0];
    setSplitViewChapterId(other ? other.id : null);
    setSplitViewType('chapter');
    setSplitViewEnabled(true);
  };

  // The header button and Näytä ▸ Jaettu näkymä. From the card view it leaves the card view and
  // shows the pane (the pane is hidden under the card view, so toggling it there did nothing visible);
  // a pane that was already open under the card view keeps what it showed.
  const toggleSplitView = () => {
    if (corkboardEnabled) {
      setCorkboardEnabled(false);
      if (!splitViewEnabled) openSplitView();
      return;
    }
    if (splitViewEnabled) setSplitViewEnabled(false);
    else openSplitView();
  };

  // A yes/no question that does not freeze the window (window.confirm() does).
  // Resolves with true or false. Options: danger (the action deletes, replaces or discards
  // the author's text or data), requireChoice (Esc and the scrim answer nothing),
  // dangerCancel (the cancel button is the destructive one).
  const askConfirm = (title, message, confirmLabel, cancelLabel = 'Peruuta', options = {}) => new Promise((resolve) => {
    setConfirmRequest({ title, message, confirmLabel, cancelLabel, ...options, resolve });
  });

  // In-app replacement for window.prompt(), which Electron does not provide.
  // Resolves with the text, or null if the dialog is cancelled.
  const askText = (title, defaultValue = '', placeholder = '', confirmLabel) => new Promise((resolve) => {
    setTextPrompt({ title, defaultValue, placeholder, confirmLabel, resolve });
  });

  // The suggestion controller sees this render's chapter, editor and project (stage I-03)
  suggestionsRef.current.bind({
    getEditor: () => editorRef.current,
    activeChapterId: activeChapter ? activeChapter.id : null,
    chapters: project.structure,
    setInfo: setSuggestionInfo,
    reportPending: (count) => window.electronAPI?.setPendingSuggestions?.(count),
    logDecision: (fields) => appendAiLog(decisionRow(fields)),
    askConfirm: (t, m, c, x) => askConfirm(t, m, c, x, { danger: true }),
    openPasteDialog: setPasteEditsRequest,
    getSetting: (key, fallback) => getSettingsStore().get(key, fallback),
    setSetting: (key, value) => { getSettingsStore().set(key, value); },
    takeSnapshot: (chapterId, reason) => takeAutoSnapshot(reason)
  });

  // The review controller sees this render's project, chapter, live text and selection (stage I-08).
  // Findings and statuses are not manuscript text: they are written to the chapter without an undo step.
  // aiOff is aiDisabled, never aiHidden: focus mode does not switch the tab's model checks off.
  reviewRef.current.bind({
    project,
    activeChapterId: activeChapter ? activeChapter.id : null,
    liveText: liveContentRef.current.content,
    selection: textSelection ? { from: textSelection.start, to: textSelection.end } : null,
    getEditor: () => editorRef.current,
    getProject: () => projectRef.current,
    updateChapter: (chapterId, fn) => {
      setProject(prev => ({ ...prev, structure: prev.structure.map(ch => (ch.id === chapterId ? fn(ch) : ch)) }));
      setUnsavedChanges(true);
    },
    updateProject: (fn) => { setProject(fn); setUnsavedChanges(true); },
    propose: (chapterId, changes, options) => suggestionsRef.current.propose(chapterId, changes, options),
    askConfirm: (t, m, c, x) => askConfirm(t, m, c, x, { danger: true }),
    visible: showInspector && inspectorTab === 'review',
    aiOff: aiDisabled,
    notify: () => setReviewTick(tick => tick + 1)
  });

  // Undo/Redo. In an ordinary text field (titles, notes, search) the field's
  // own undo applies; everywhere else the project history does. In the Pikamuokkaus prompt's field
  // the field's own history (inlinePromptView.js), also when it is empty again; only an empty
  // Tarkenna… field after a result gives Cmd+Z to the project history, so the accept just made can
  // be undone (fieldOwnsUndo).
  const runHistory = (direction) => {
    const active = document.activeElement;
    const inManuscript = active && active.closest && active.closest('.cm-content');
    const inPrompt = active && active.closest && active.closest('.cm-faust-prompt');
    const fieldUndo = inPrompt
      ? quickEditRef.current.fieldOwnsUndo()
      : (active && !inManuscript && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'));
    if (fieldUndo) {
      // The prompt's field steps through its own history; the browser's undo would reach past it
      // into the manuscript's editing steps once the field's own were used up
      if (inPrompt && typeof active.faustHistory === 'function') active.faustHistory(direction);
      else document.execCommand(direction);
      return;
    }

    const manager = commandManagerRef.current;
    if (!manager) return;

    // Show the chapter the step belongs to, so the change is never invisible
    const stack = direction === 'undo' ? manager.undoStack : manager.redoStack;
    const step = stack[stack.length - 1];
    if (step && step.chapterId && step.chapterId !== activeChapterId &&
        project.structure.some(ch => ch.id === step.chapterId)) {
      setActiveChapterId(step.chapterId);
    }

    // A redo removes the suggestions it accepts again; an undo of an accept brings them back
    suggestionsRef.current.beforeHistory(direction, step);
    const done = direction === 'undo' ? manager.undo() : manager.redo();
    if (done) { setUnsavedChanges(true); suggestionsRef.current.afterHistory(direction, step); }
  };

  const undo = () => runHistory('undo');
  const redo = () => runHistory('redo');

  // ---------------------------------------------------------------------
  // Find & Replace. Matching is in src/editor/textTools.js.
  // ---------------------------------------------------------------------
  const searchOptions = () => ({ caseSensitive, wholeWord: matchWholeWord, regex: useRegex });

  // A chapter's text as the search should see it: the open chapter as the
  // editor has it right now, the others from the project
  const chapterText = (chapter) => (
    chapter.id === activeChapter?.id && liveContentRef.current.chapterId === chapter.id
      ? liveContentRef.current.content
      : (chapter.content || '')
  );

  const snippet = (text, start, end, radius) => excerptOf(text, start, end, radius);

  // All matches for a term with the current options and scope
  const collectSearchResults = (term) => {
    const options = searchOptions();
    const results = [];

    const chapters = searchInAllChapters ? project.structure : [activeChapter];
    chapters.forEach(chapter => {
      if (!chapter) return;
      const content = chapterText(chapter);
      findMatches(content, term, options).forEach(match => {
        results.push({
          ...match,
          context: snippet(content, match.start, match.end, 50),
          chapterId: chapter.id,
          chapterTitle: chapter.title || 'Nimetön luku'
        });
      });
    });

    // Global search also looks at characters, places and plot threads. A character saved by the
    // builder has its fields at the top level, an older one inside basicInfo; places are kept by
    // name in project.continuity.locations.
    if (searchGlobally) {
      const searchItems = (items, type, fields, unnamed) => {
        (items || []).forEach(item => {
          if (!item) return;
          const info = item.basicInfo || {};
          const searchable = fields.map(field => item[field] || info[field]).filter(Boolean).join(' ');
          findMatches(searchable, term, options).forEach(match => {
            results.push({
              ...match,
              type,
              context: snippet(searchable, match.start, match.end, 30),
              itemId: item.id || item.name,
              itemName: info.name || item.name || unnamed,
              chapterId: null,
              chapterTitle: null
            });
          });
        });
      };

      searchItems(project.characters, 'character', ['name', 'description', 'background', 'occupation', 'notes'], 'Nimetön hahmo');
      searchItems(Object.values((project.continuity && project.continuity.locations) || {}), 'location',
        ['name', 'description', 'historicalContext', 'notes'], 'Nimetön paikka');
      searchItems(project.plotThreads, 'thread', ['name', 'description', 'resolution', 'notes'], 'Nimetön juonilanka');
    }

    return results;
  };

  const performSearch = (term = searchTerm) => {
    // Also used directly as an event handler: an event is not a search term
    if (typeof term !== 'string') term = searchTerm;

    if (!term) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      return;
    }

    // An invalid regular expression is the field's error state, not a notification
    if (!buildSearchPattern(term, searchOptions())) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
      setFindPatternError(true);
      return;
    }
    setFindPatternError(false);

    addToSearchHistory(term);

    const results = collectSearchResults(term);
    lastSearchRef.current = term;

    // Start from the first match at or after the cursor in the open chapter
    let first = 0;
    if (editorRef.current && activeChapter) {
      const cursor = editorRef.current.selectionStart;
      const ahead = results.findIndex(r => r.chapterId === activeChapter.id && r.start >= cursor);
      if (ahead !== -1) first = ahead;
    }

    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? first : -1);
    if (results.length > 0) showResult(results[first]);

    console.log('[Find] Found', results.length, 'matches for:', term,
      searchGlobally ? '(global)' : searchInAllChapters ? '(all chapters)' : '(current chapter)');
  };

  // Add to search history
  const addToSearchHistory = (term) => {
    setSearchHistory(prev => {
      const filtered = prev.filter(t => t !== term);
      const updated = [term, ...filtered].slice(0, 10); // Keep max 10
      localStorage.setItem('faust-search-history', JSON.stringify(updated));
      return updated;
    });
  };

  // Bring a search result into view. Matches in characters, locations and
  // threads have no place in the manuscript, so there is nothing to show.
  // The match highlight itself comes from the effect near the end of the component.
  const showResult = (result) => {
    if (!result || !result.chapterId) return;

    if (result.chapterId !== activeChapterId) {
      setActiveChapterId(result.chapterId);
    } else if (editorRef.current) {
      editorRef.current.scrollToPos(result.start);
    }
  };

  // + Kirjanmerkki… in the toolbar and Lisää ▸ Kirjanmerkki…: ask for a name, then add
  const askAndAddBookmark = async () => {
    if (!editorRef.current || !activeChapterId) return;
    const name = await askText(
      'Kirjanmerkin nimi',
      `Kirjanmerkki ${(project.bookmarks || []).length + 1}`,
      '',
      'Lisää kirjanmerkki'
    );
    if (name !== null) addBookmark(name);
  };

  // Bookmark functions
  const addBookmark = (name = '') => {
    if (!editorRef.current || !activeChapterId) return;

    const position = editorRef.current.selectionStart;
    const content = activeChapter.content || '';
    // The words around the cursor, cut at word boundaries and without Markdown markers
    const near = excerptOf(content, position, position, 30);
    const context = (near.before + near.after).trim();

    const bookmark = {
      id: `bookmark-${Date.now()}`,
      chapterId: activeChapterId,
      chapterTitle: activeChapter.title,
      position: position,
      name: name || `Kirjanmerkki ${(project.bookmarks || []).length + 1}`,
      context: context,
      color: '#d4af37', // Default gold color
      created: new Date().toISOString()
    };

    setProject(prev => ({
      ...prev,
      bookmarks: [...(prev.bookmarks || []), bookmark]
    }));
    setUnsavedChanges(true);
    console.log('[Bookmarks] Added:', bookmark.name, 'at position', position);
  };

  const deleteBookmark = (bookmarkId) => {
    setProject(prev => ({
      ...prev,
      bookmarks: (prev.bookmarks || []).filter(b => b.id !== bookmarkId)
    }));
    setUnsavedChanges(true);
  };

  const jumpToBookmark = (bookmark) => {
    // Switch to chapter if needed
    if (bookmark.chapterId !== activeChapterId) {
      setActiveChapterId(bookmark.chapterId);
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.focus();
          editorRef.current.setSelectionRange(bookmark.position, bookmark.position);
          editorRef.current.scrollToPos(bookmark.position);
        }
      }, 100);
    } else {
      if (editorRef.current) {
        editorRef.current.focus();
        editorRef.current.setSelectionRange(bookmark.position, bookmark.position);
        editorRef.current.scrollToPos(bookmark.position);
      }
    }
    setShowBookmarksPanel(false);
  };

  // The word comparison of the voice edit and Versioiden vertailu: wordDiff.js, the tested one (BUG-20, R-20)
  const computeTextDiff = (oldText, newText) => diffSegments(oldText || '', newText || '');
  // Lisätty 12 · Poistettu 5 · Sanamäärä +7 (M C.5 row 42, C.11 row 25), all three from one count of the
  // words (changeStats of the two texts), so that Lisätty minus Poistettu is always the Sanamäärä
  const diffCounts = (stats) => {
    const delta = stats.revisedWords - stats.originalWords;
    return e('span', { className: 'faust-num' },
      e('span', { className: 'faust-diff__count faust-diff__count--ins faust-diff__count--named' }, 'Lisätty ' + stats.addedWords.toLocaleString('fi-FI')), ' · ',
      e('span', { className: 'faust-diff__count faust-diff__count--del faust-diff__count--named' }, 'Poistettu ' + stats.removedWords.toLocaleString('fi-FI')), ' · ',
      e('span', { className: 'faust-diff__count' }, 'Sanamäärä ' + (delta > 0 ? '+' : delta < 0 ? '−' : '±') + Math.abs(delta).toLocaleString('fi-FI')));
  };

  // Snapshot functions (project-level named versions)
  const createSnapshot = (name, description = '') => {
    // Deep copy of current project structure
    const snapshotData = {
      id: `snapshot-${Date.now()}`,
      name: name || `Tilannekuva ${formatDateTimeFi(new Date())}`,
      description: description,
      created: new Date().toISOString(),
      totalWords: totalWords,
      chapterCount: project.structure.length,
      // Deep copy of structure with content
      structure: JSON.parse(JSON.stringify(project.structure))
    };

    setProject(prev => ({
      ...prev,
      snapshots: [...(prev.snapshots || []), snapshotData]
    }));
    setUnsavedChanges(true);
    console.log('[Snapshots] Created:', snapshotData.name);
    return snapshotData;
  };

  // Before a bulk accept (the suggestion controller asks): one automatic tilannekuva of that name, three kept
  const takeAutoSnapshot = (name) => {
    const now = new Date();
    setProject(prev => addAutoSnapshot(prev, { name, description: 'Automaattinen tilannekuva. Näistä säilytetään kolme uusinta.', now, auto: 'bulk' }).project);
    setUnsavedChanges(true);
    return 'snapshot-' + now.getTime();
  };

  const deleteSnapshot = (snapshotId) => {
    setProject(prev => ({
      ...prev,
      snapshots: (prev.snapshots || []).filter(s => s.id !== snapshotId)
    }));
    setUnsavedChanges(true);
  };

  const restoreSnapshot = async (snapshotId) => {
    const snapshot = (project.snapshots || []).find(s => s.id === snapshotId);
    if (!snapshot) return;

    if (!(await askConfirm(
      'Palautetaanko tilannekuva?',
      `Kaikki käsikirjoituksen luvut korvataan tilannekuvalla ”${snapshot.name}”. ` +
        'Nykyinen tila tallennetaan ensin omaksi tilannekuvakseen, joten voit palata siihen.',
      'Palauta tilannekuva',
      'Peruuta',
      { danger: true }
    ))) {
      return;
    }

    // Keep a way back: the state being replaced becomes a snapshot of its own
    createSnapshot(`Ennen palautusta: ${snapshot.name}`, 'Automaattinen tilannekuva ennen palautusta');

    // Restore structure from snapshot
    setProject(prev => ({
      ...prev,
      structure: JSON.parse(JSON.stringify(snapshot.structure)),
      modified: new Date().toISOString()
    }));
    // Undo steps refer to chapters as they were before the restore
    if (commandManagerRef.current) commandManagerRef.current.clear();
    setUnsavedChanges(true);
    setShowSnapshotsPanel(false);
    console.log('[Snapshots] Restored:', snapshot.name);
  };

  const compareWithSnapshot = (snapshotId) => {
    const snapshot = (project.snapshots || []).find(s => s.id === snapshotId);
    if (!snapshot) return;

    // Find the same chapter in snapshot
    const snapshotChapter = snapshot.structure.find(ch => ch.id === activeChapterId);
    if (!snapshotChapter) {
      notify('warning', 'Tätä lukua ei ole valitussa tilannekuvassa.');
      return;
    }

    // Word counts of the open chapter now and in the tilannekuva
    const currentWords = countWords(chapterText(activeChapter));
    const snapshotWords = countWords(snapshotChapter.content);
    const diff = currentWords - snapshotWords;
    const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';

    notify('info', 'Sanamäärän muutos', {
      detail: `Luku: ${activeChapter.title || 'Nimetön luku'}\n` +
        `Nyt: ${count(currentWords, 'sana')}\n` +
        `Tilannekuvassa: ${count(snapshotWords, 'sana')}\n` +
        `Muutos: ${sign}${count(Math.abs(diff), 'sana')}`,
      duration: 0
    });
  };

  // Collection functions (dynamic chapter groupings)
  const createCollection = (name, type = 'manual', filter = null) => {
    const collection = {
      id: `collection-${Date.now()}`,
      name: name || 'Uusi kokoelma',
      type: type, // 'manual', 'status', 'character', 'search'
      filter: filter, // Filter criteria for dynamic collections
      chapterIds: [], // For manual collections
      color: '#d4af37',
      created: new Date().toISOString()
    };

    setProject(prev => ({
      ...prev,
      collections: [...(prev.collections || []), collection]
    }));
    setUnsavedChanges(true);
    return collection;
  };

  const deleteCollection = (collectionId) => {
    setProject(prev => ({
      ...prev,
      collections: (prev.collections || []).filter(c => c.id !== collectionId)
    }));
    if (activeCollectionId === collectionId) {
      setActiveCollectionId(null);
    }
    setUnsavedChanges(true);
  };

  // Get chapters that belong to a collection (supports both manual and dynamic)
  const getCollectionChapters = (collection) => {
    if (!collection) return [];

    if (collection.type === 'manual') {
      return project.structure.filter(ch => collection.chapterIds.includes(ch.id));
    }

    // Dynamic collections based on filter. Status values are compared normalised: an old
    // filter 'revised' means 'revision', a chapter without a status is 'plan'. Nothing stored changes.
    if (collection.type === 'status' && collection.filter) {
      const wanted = normStatus(collection.filter);
      return project.structure.filter(ch => normStatus(ch.status) === wanted);
    }

    if (collection.type === 'character' && collection.filter) {
      // Find chapters mentioning this character
      const charName = collection.filter.toLowerCase();
      return project.structure.filter(ch =>
        (ch.content || '').toLowerCase().includes(charName) ||
        (ch.notesAI?.characterMentions || []).some(m => m.toLowerCase().includes(charName))
      );
    }

    if (collection.type === 'search' && collection.filter) {
      const searchTerm = collection.filter.toLowerCase();
      return project.structure.filter(ch =>
        (ch.content || '').toLowerCase().includes(searchTerm) ||
        (ch.title || '').toLowerCase().includes(searchTerm)
      );
    }

    return [];
  };

  const stepSearch = (direction) => {
    if (searchResults.length === 0) {
      if (searchTerm) performSearch();
      return;
    }

    const hitCount = searchResults.length;
    const index = (currentSearchIndex + direction + hitCount) % hitCount;
    setCurrentSearchIndex(index);
    showResult(searchResults[index]);
  };

  const findNext = () => stepSearch(1);
  const findPrevious = () => stepSearch(-1);

  // Enter in the search field: search, or step if this term was just searched
  const handleSearchEnter = (backwards) => {
    if (searchResults.length > 0 && lastSearchRef.current === searchTerm) {
      stepSearch(backwards ? -1 : 1);
    } else {
      performSearch();
    }
  };

  // Change any chapter's text through the undo history
  const setChapterText = (chapterId, oldContent, newContent, meta = null) => {
    if (oldContent === newContent) return;

    if (chapterId === activeChapter?.id) {
      updateChapterContent(newContent, false, meta);
      return;
    }

    if (commandManagerRef.current && window.UpdateContentCommand) {
      commandManagerRef.current.execute(
        new window.UpdateContentCommand(setProject, chapterId, oldContent, newContent, meta)
      );
    } else {
      setProject(prev => ({
        ...prev,
        structure: prev.structure.map(ch =>
          ch.id === chapterId ? { ...ch, content: newContent, wordCount: countWords(newContent) } : ch
        )
      }));
    }
    setUnsavedChanges(true);
  };

  const replaceCurrent = () => {
    const result = searchResults[currentSearchIndex];
    if (!result || !result.chapterId || !activeChapter) return;

    // Replace only what is on screen: open the chapter first
    if (result.chapterId !== activeChapter.id) {
      showResult(result);
      return;
    }

    const content = chapterText(activeChapter);

    // The text may have changed since the search: never replace something else
    if (content.slice(result.start, result.end) !== result.text) {
      performSearch();
      return;
    }

    updateChapterContent(content.slice(0, result.start) + replaceTerm + content.slice(result.end));

    // Search again in the new text and go on from the replaced spot
    const results = collectSearchResults(searchTerm);
    const after = result.start + replaceTerm.length;
    const next = Math.max(0, results.findIndex(r => r.chapterId === result.chapterId && r.start >= after));

    setSearchResults(results);
    setCurrentSearchIndex(results.length > 0 ? next : -1);
    if (results.length > 0) showResult(results[next]);
  };

  // Replace every match in the searched chapters. Each chapter is its own undo step.
  // Always the term now in the field (old hits are cleared when it changes).
  const replaceAll = async () => {
    const term = searchTerm;
    if (!term) return;

    const options = searchOptions();
    const chapters = (searchInAllChapters ? project.structure : [activeChapter]).filter(Boolean);
    const changes = [];
    let total = 0;

    chapters.forEach(chapter => {
      const content = chapterText(chapter);
      const replaced = replaceAllMatches(content, term, replaceTerm, options);
      if (replaced.count > 0) {
        changes.push({ chapter, content, text: replaced.text });
        total += replaced.count;
      }
    });

    if (total === 0) return;

    const where = `${total} kohdassa ${changes.length} luvussa`;
    if (!(await askConfirm(
      'Korvataanko kaikki osumat?',
      (replaceTerm
        ? `Teksti ”${term}” korvataan tekstillä ”${replaceTerm}” ${where}.`
        : `Teksti ”${term}” poistetaan ${where}.`) + ' Kumoa palauttaa yhden luvun kerrallaan.',
      'Korvaa kaikki',
      'Peruuta',
      { danger: true }
    ))) {
      return;
    }

    changes.forEach(change => setChapterText(change.chapter.id, change.content, change.text));

    setSearchResults([]);
    setCurrentSearchIndex(-1);
    lastSearchRef.current = '';   // the hits are gone with the text they were found in
    console.log('[Replace All] Replaced', total, 'matches in', changes.length, 'chapters');
    // Korvaa kaikki… is disabled now that the hits are gone: the focus goes to the search field
    // (after the question has given it back), never to the body
    setTimeout(() => {
      const field = document.getElementById('search-term');
      if (field && (document.activeElement === document.body || (document.activeElement && document.activeElement.disabled))) field.focus();
    }, 0);
  };

  // Etsi closes by its close button, its format bar button, Esc, a press outside it, or another popover
  // opening (usePopover). Whatever the path, the hits and the record of the last search go with it.
  const closeFindDialog = () => setShowFindDialog(false);
  useEffect(() => {
    if (showFindDialog) return;
    setShowReplaceDialog(false);
    setSearchResults(prev => (prev.length ? [] : prev));
    setCurrentSearchIndex(-1);
    lastSearchRef.current = '';   // the panel reopens without a stale "Ei osumia"
  }, [showFindDialog]);

  // Hits belong to the term and the options they were found with. A new term clears them
  // (unless it is the term just searched, as after a click in Aiemmat haut); a changed option
  // clears them and the record of the last search, so that the next Enter searches again.
  useEffect(() => {
    setFindPatternError(false);
    if (searchTerm !== lastSearchRef.current) {
      setSearchResults([]);
      setCurrentSearchIndex(-1);
    }
  }, [searchTerm]);

  useEffect(() => {
    setFindPatternError(false);
    lastSearchRef.current = '';
    setSearchResults([]);
    setCurrentSearchIndex(-1);
  }, [caseSensitive, matchWholeWord, useRegex, searchInAllChapters, searchGlobally]);

  // Save project
  // Update recent files list
  const addToRecentFiles = (filePath, projectTitle) => {
    setRecentFiles(prev => {
      // Remove duplicates and add to top
      const filtered = prev.filter(f => f.path !== filePath);
      const updated = [
        { path: filePath, title: projectTitle, lastOpened: new Date().toISOString() },
        ...filtered
      ].slice(0, 10); // Keep max 10 recent files

      // Save to localStorage
      localStorage.setItem('faust-recent-files', JSON.stringify(updated));
      return updated;
    });
  };

  // ---------------------------------------------------------------------
  // Project files
  // ---------------------------------------------------------------------

  // One row of Tekoälyn käyttö: requests from the client, decisions from the suggestion controller
  const appendAiLog = (row) => {
    if (!row) return;
    setProject(prev => ({ ...prev, aiLog: appendAiLogRow(prev.aiLog, row, new Date().toISOString()) }));
    setUnsavedChanges(true);
  };

  // Make sure a loaded file has everything the UI expects.
  // Returns null if the data is not a FAUST project.
  const normalizeProject = (data) => {
    if (!data || !Array.isArray(data.structure)) return null;

    const defaults = createDefaultProject();
    return {
      ...defaults,
      ...data,
      ...normalizeContextFields(data),
      targets: { ...defaults.targets, ...(data.targets || {}) },
      typography: { ...defaults.typography, ...(data.typography || {}) },
      proofread: { ...defaults.proofread, ...(data.proofread || {}) },
      keepNote: typeof data.keepNote === 'string' ? data.keepNote.slice(0, 1000) : '',
      review: { ...defaults.review, ...(data.review || {}) },
      ai: {
        ...defaults.ai,
        ...(data.ai || {}),
        modes: { ...defaults.ai.modes, ...((data.ai && data.ai.modes) || {}) }
      },
      structure: data.structure.length > 0 ? data.structure : defaults.structure
    };
  };

  // Replace the open project (New, Open, Recent, recovery)
  const openProject = (data, filePath) => {
    // A request of the previous project must not answer into this one; its suggestions, its editor
    // and its usage rows stay with it (the project epoch, contracts.md 4.4)
    getAIClient().cancelAll();
    projectEpochRef.current += 1; setProjectEpoch(projectEpochRef.current);
    suggestionsRef.current.reset();
    // The Pikamuokkaus prompt, its request and its attempts belong to the previous project
    if (quickEditRef.current) quickEditRef.current.reset();
    // The old paths' results on screen (voice, Liminal Engine, Kirjoita tekoälyn kanssa) and their targets
    oldPathTargetRef.current = { voice: null, rewrite: null, liminal: null };
    setVoiceDiffView(null); setAiSuggestion(null); setContinuePreview('');
    // A Liitä muokkauksina dialog compared the previous project's text (reset() dropped its target)
    setPasteEditsRequest(null);
    // Miksi? answers belong to the previous project's changes (Kielen työkalut remounts with the epoch)
    explainCacheRef.current.clear();
    // A running check, the selected finding and the failure details belong to the previous project
    reviewRef.current.reset();
    setProject(data);
    setCurrentFilePath(filePath || null);
    setActiveChapterId(data.structure[0]?.id || 'chapter-1');
    setUnsavedChanges(false);
    setSearchResults([]);
    setCurrentSearchIndex(-1);
    // A consistency result belongs to the project it was found in
    setConsistencyErrors([]);
    setConsistencyChecked(false);
    // The undo history belongs to the project that was open
    if (commandManagerRef.current) commandManagerRef.current.clear();
    // The writing session counts from the opening (M C.8 row 16): its baseline is the opened manuscript
    setSessionStartWords((data.structure || []).reduce((sum, ch) => sum + (ch.content ? ch.content.split(/\s+/).filter(Boolean).length : 0), 0));
    setSessionStartTime(new Date());
  };

  // Save. Writes to the project's file; asks for a name only when there is
  // none yet or for Save As. Returns true once the project is on disk.
  const saveProject = async ({ saveAs = false } = {}) => {
    if (!window.electronAPI) {
      console.error('[Save] Electron API not available');
      return false;
    }

    flushCodexDrafts();
    const saving = projectRef.current;

    try {
      setSavingState('saving');
      const result = await window.electronAPI.saveProject(saving, { filePath: currentFilePath, saveAs });

      if (result.success) {
        setCurrentFilePath(result.path);
        // Typing during the save keeps the project marked as changed
        if (projectRef.current === saving && !codexDraftsPending()) {
          setUnsavedChanges(false);
          window.electronAPI.clearBackup();
        }
        setSavingState('saved');
        addToRecentFiles(result.path, saving.title);
        console.log('[Save] Project saved:', result.path);
        setTimeout(() => setSavingState('idle'), 2000);
        return true;
      }

      if (result.canceled) {
        setSavingState('idle');
        return false;
      }

      throw new Error(result.error || 'tuntematon virhe');
    } catch (error) {
      console.error('[Save] Error:', error);
      setSavingState('error');
      notify('error', 'Tallennus epäonnistui: ' + saveFailureReason(error) + '.');
      setTimeout(() => setSavingState('idle'), 3000);
      return false;
    }
  };

  // The three commonest file errors in the author's words; any other reason as it came
  const saveFailureReason = (error) => {
    const text = failureReason(error);
    if (/ENOENT/.test(text)) return 'tiedostoa tai kansiota ei löydy';
    if (/EACCES|EPERM/.test(text)) return 'kansioon ei ole kirjoitusoikeutta';
    if (/ENOSPC/.test(text)) return 'levy on täynnä';
    return text;
  };

  // Something is about to replace the open project: offer to save first.
  // Returns true if it is fine to go on.
  const confirmLeavingProject = async () => {
    if (!(await suggestionsRef.current.confirmDiscard())) return false;
    if (!unsavedChanges) return true;

    const choice = await window.electronAPI.confirmUnsavedChanges();
    if (choice === 'save') return saveProject();
    if (choice === 'discard') {
      window.electronAPI.clearBackup();
      return true;
    }
    return false;
  };

  // The window is closing and the user chose Save
  const saveAndClose = async () => {
    const saved = await saveProject();
    if (saved) window.electronAPI.confirmClose();
    else window.electronAPI.cancelClose();
  };

  const showLoadedProject = (rawData, filePath) => {
    const data = normalizeProject(rawData);
    if (!data) {
      notify('error', 'Avaaminen epäonnistui: tiedosto on vioittunut tai se ei ole FAUST-projekti.');
      return false;
    }
    openProject(data, filePath);
    addToRecentFiles(filePath, data.title);
    console.log('[Load] Project loaded:', filePath);
    return true;
  };

  // Load project
  const loadProject = async () => {
    if (!window.electronAPI) {
      console.error('[Load] Electron API not available');
      return;
    }
    if (!(await confirmLeavingProject())) return;

    const result = await window.electronAPI.loadProject();
    if (result.success) {
      showLoadedProject(result.data, result.filePath);
    } else if (result.error) {
      console.error('[Load] Error:', result.error);
      notify('error', 'Avaaminen epäonnistui: tiedosto on vioittunut tai se ei ole FAUST-projekti.');
    }
  };

  // Load recent file
  const loadRecentFile = async (filePath) => {
    if (!window.electronAPI) return;
    if (!(await confirmLeavingProject())) return;

    const result = await window.electronAPI.loadProjectFromPath(filePath);
    if (result.success && showLoadedProject(result.data, filePath)) return;

    // The file is gone or unreadable: say so and drop it from the list
    if (!result.success) notify('error', `Tiedostoa ei löytynyt: ${filePath}. Se poistettiin Viimeisimmät-valikosta.`);
    setRecentFiles(prev => {
      const updated = prev.filter(f => f.path !== filePath);
      localStorage.setItem('faust-recent-files', JSON.stringify(updated));
      return updated;
    });
  };

  // New project
  const newProject = async () => {
    if (!(await confirmLeavingProject())) return;
    openProject(createDefaultProject(), null);
    console.log('[New] New project created');
  };

  // Import a file or a folder. The main process reads it; the preview dialog
  // shows the chapters, and nothing is written to the project before "Tuo".
  // inPreview: asked from the open preview (Valitse toinen kansio…, Avaa …). Its failure is
  // shown in the preview, which stays as it was (V 9.6, R-72); from the menu it is a notification.
  const beginImport = async (kind, request, { inPreview = false } = {}) => {
    if (!window.electronAPI) return;
    if (inPreview) setImportPickError(null);
    const result = kind === 'folder'
      ? await window.electronAPI.importFolder(request)
      : await window.electronAPI.importDocument();
    if (!result.success) {
      if (!result.error) return;
      const text = 'Tuonti epäonnistui: ' + failureReason(result.error) + '.';
      // The path the main process could not read goes under the sentence (R-72)
      if (inPreview) setImportPickError({ text, detail: result.path || null });
      else notify('error', text, result.path ? { detail: result.path } : {});
      return;
    }
    setImportPickError(null);
    setImportSource(result);
  };

  // "Tuo" in the preview (selection) or a cancel (null). The import and its snapshot are one
  // update, so the snapshot is exactly the state being changed (importPlan.applyImport).
  const finishImport = (selection) => {
    setImportSource(null);
    setImportPickError(null);
    if (!selection || selection.chapters.length === 0) return;

    const docs = buildChapterDocs(selection, (title) => createDocument('chapter', title));
    setProject(prev => applyImport(prev, selection, docs));
    if (selection.mode === 'replace') {
      // Undo steps refer to chapters that a replace has removed
      if (commandManagerRef.current) commandManagerRef.current.clear();
      // A consistency result belongs to the text it was found in
      setConsistencyErrors([]);
      setConsistencyChecked(false);
    }
    setActiveChapterId(docs[0].id);
    setUnsavedChanges(true);
    console.log('[Import]', docs.length, 'chapters,', selection.mode);
  };

  // Print the whole manuscript through the system print dialog
  const printManuscript = async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.printManuscript({ project });
    if (!result.success && result.error) {
      console.error('[Print] Error:', result.error);
      notify('error', 'Tulostus epäonnistui. Tarkista tulostin ja yritä uudelleen.');
    }
  };

  // Helper: Create new document with full AI structure
  const createDocument = (type, title, parentId = null) => {
    const timestamp = new Date().toISOString();
    return {
      id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title,
      order: 0,
      content: '',
      wordCount: 0,
      children: [],
      parentId,

      // AI-Enhanced Metadata
      synopsis: '',
      synopsisAI: '',
      synopsisManual: '',

      notes: '',
      notesAI: {
        characterMentions: [],
        locations: [],
        timeframe: '',
        mood: '',
        themes: [],
        continuityIssues: []
      },

      status: 'plan', // plan, draft, revision, final
      noAI: false, // Ei tekoälylle
      povCharacter: null, // ID of POV character
      mood: '', // User-set mood/tone
      storyTimestamp: '', // Time in story (e.g., "Day 3, Morning")

      // Annotations array for margin notes, highlights, and AI suggestions
      annotations: [],

      aiQuality: {
        score: 0,
        lastAnalyzed: null,
        issues: [],
        strengths: [],
        suggestions: [],
        readiness: 'draft'
      },

      structureHints: {
        shouldBeSplit: false,
        suggestedSceneBreaks: [],
        relatedChapters: [],
        missingTransition: false
      },

      pacing: {
        speed: 'medium',
        tension: 0,
        wordDensity: 0,
        dialogueRatio: 0
      },

      label: '',
      color: '',

      created: timestamp,
      modified: timestamp,

      versions: []
    };
  };

  // Add new chapter
  const addChapter = () => {
    const newChapterNumber = project.structure.length + 1;
    const newChapter = createDocument('chapter', `Luku ${newChapterNumber}`);

    setProject(prev => ({
      ...prev,
      structure: [...prev.structure, newChapter]
    }));

    setActiveChapterId(newChapter.id);
    setUnsavedChanges(true);
    console.log('[Chapter] New chapter added:', newChapter.id);
  };

  // Delete chapter
  const deleteChapter = async (chapterId) => {
    if (project.structure.length === 1) {
      notify('warning', 'Ainoaa lukua ei voi poistaa. Projektissa on oltava vähintään yksi luku.');
      return;
    }

    const chapter = project.structure.find(ch => ch.id === chapterId);
    if (!chapter) return;
    const confirmed = await askConfirm(
      'Poistetaanko luku?',
      `Luku ”${chapter.title || 'Nimetön luku'}” ja sen teksti (${count(countWords(chapterText(chapter)), 'sana')}) poistetaan. Poistoa ei voi kumota.`,
      'Poista luku',
      'Peruuta',
      { danger: true }
    );
    if (!confirmed) return;

    const deletedIndex = project.structure.findIndex(ch => ch.id === chapterId);
    const remaining = project.structure.filter(ch => ch.id !== chapterId);

    setProject(prev => ({
      ...prev,
      structure: prev.structure.filter(ch => ch.id !== chapterId)
    }));

    // If the open chapter was deleted, open its neighbour. The id must come
    // from the chapters that are left, never from the list before the delete.
    if (chapterId === activeChapterId && remaining.length > 0) {
      setActiveChapterId((remaining[Math.max(0, deletedIndex - 1)] || remaining[0]).id);
    }
    setUnsavedChanges(true);
    console.log('[Chapter] Deleted:', chapterId);
  };

  // Move chapter up
  const moveChapterUp = (chapterId) => {
    const index = project.structure.findIndex(ch => ch.id === chapterId);
    if (index === 0) return; // Already first

    setProject(prev => {
      const newStructure = [...prev.structure];
      [newStructure[index - 1], newStructure[index]] = [newStructure[index], newStructure[index - 1]];

      // Update order numbers
      newStructure.forEach((ch, idx) => ch.order = idx);

      return { ...prev, structure: newStructure };
    });

    setUnsavedChanges(true);
  };

  // Move chapter down
  const moveChapterDown = (chapterId) => {
    const index = project.structure.findIndex(ch => ch.id === chapterId);
    if (index === project.structure.length - 1) return; // Already last

    setProject(prev => {
      const newStructure = [...prev.structure];
      [newStructure[index], newStructure[index + 1]] = [newStructure[index + 1], newStructure[index]];

      // Update order numbers
      newStructure.forEach((ch, idx) => ch.order = idx);

      return { ...prev, structure: newStructure };
    });

    setUnsavedChanges(true);
  };

  // Change AI mode
  const setAIMode = (modeName) => {
    setProject(prev => ({
      ...prev,
      ai: {
        ...prev.ai,
        currentMode: modeName
      }
    }));
    setUnsavedChanges(true);
    console.log('[AI Mode] Changed to:', modeName);
  };

  // Get current mode config
  const getCurrentMode = () => {
    return project.ai.modes[project.ai.currentMode] || project.ai.modes.production;
  };

  // Helper function: Call AI with current mode settings
  const callAIWithMode = async (userPrompt, options = {}) => {
    if (!window.electronAPI) {
      // Shown after a colon: '<Toiminto> epäonnistui: <syy>.'
      throw new Error('toiminto ei ole käytettävissä tässä ikkunassa');
    }

    // Read the project at call time through the ref. This function is also held
    // by long-lived AI services, and a project captured in a closure would be
    // the one from the render in which the service was created.
    const current = projectRef.current || project;
    const mode = current.ai.modes[current.ai.currentMode] || current.ai.modes.production;

    // Build full prompt with mode's system prompt
    const fullPrompt = mode.systemPrompt
      ? `${mode.systemPrompt}\n\n${userPrompt}`
      : userPrompt;

    // Merge mode settings with optional overrides
    const apiParams = {
      prompt: fullPrompt,
      temperature: options.temperature ?? mode.temperature,
      max_tokens: options.max_tokens ?? mode.maxTokens,
      model: options.model ?? current.ai.model
    };

    console.log(`[AI Mode] Using ${current.ai.currentMode} mode (temp: ${apiParams.temperature})`);

    // Call Claude API
    const response = await window.electronAPI.claudeAPI(apiParams);
    // A stop, the switch or the wire guard: the three analyses show it as it is (R-21)
    if (response && response.success === false) refusalRef.current = asIsNotice(response.error);

    // Track cost with CostOptimizer
    if (costOptimizerRef.current) {
      try {
        let outputText = '';
        if (typeof response === 'string') {
          outputText = response;
        } else if (response?.content) {
          outputText = response.content;
        } else if (response?.text) {
          outputText = response.text;
        } else if (response?.data) {
          outputText = response.data;
        }

        const trackingInfo = costOptimizerRef.current.trackRequest(
          'anthropic',
          apiParams.model,
          fullPrompt,
          outputText
        );

        console.log(`[CostOptimizer] Request: $${trackingInfo.cost.toFixed(4)}, Total: $${trackingInfo.runningTotal.toFixed(2)}`);

        // Refresh the usage display. (This used to be setProject({ ...project }),
        // which put back the project as it was when the request started, or, for
        // the AI services, as it was at start-up: an empty project.)
        setAiUsageTick(tick => tick + 1);
      } catch (err) {
        console.error('[CostOptimizer] Tracking failed:', err);
      }
    }

    return response;
  };

  // Long-lived services call through this ref, so they always reach the
  // callAIWithMode of the latest render
  callAIRef.current = callAIWithMode;
  const callAIStable = (...args) => callAIRef.current(...args);

  // RefinementManager reads the reply as a string (or .content / .text), while callAIWithMode
  // answers { success, data }. This hands it the text and turns a failed or empty answer into
  // an error, so that a failure never becomes an empty new text of the chapter.
  const refinementCall = async (prompt, options) => {
    const response = await callAIStable(prompt, options);
    if (typeof response === 'string') {
      if (!response.trim()) throw new Error('tekoäly ei palauttanut tekstiä');
      return response;
    }
    // The error as main gave it: the caller's catch makes the reason, and a stop or the switch
    // keeps its sentence whole for asIsNotice (R-21)
    if (!response || response.success === false) throw new Error(String((response && response.error) || 'tuntematon virhe'));
    const text = response.data || response.content || response.text || '';
    if (!String(text).trim()) throw new Error('tekoäly ei palauttanut tekstiä');
    return text;
  };

  // AI Cast Analysis
  const analyzeCast = async (characterTypes) => {
    const prompt = `You are a character psychologist analyzing a book's cast.

The author wants these character types:
${characterTypes.map((type, idx) => `${idx + 1}. ${type}`).join('\n')}

For each character type, suggest:
1. Archetypal family (e.g., "The Sage/Hermit", "The Innocent/Crusader")
2. 3-4 real-world examples (historical figures, authors, etc.)
3. Function in story
4. What they balance against (other characters)
5. Potential flaws

Also analyze:
- Cast dynamics (conflicts, triangles)
- Warnings (e.g., "too dark", "missing gender balance")

Return ONLY valid JSON (no markdown, no extra text):
{
  "suggestions": [
    {
      "type": "character type from input",
      "archetypeFamily": "The Sage/Hermit",
      "examples": ["Marcus Aurelius", "Epictetus", "Miyamoto Musashi"],
      "functionInStory": "Mentor who teaches through detachment",
      "balances": "Young idealist (emotion vs reason)",
      "flaws": "Emotional unavailability, rigidity"
    }
  ],
  "dynamics": {
    "conflicts": ["description of key conflicts"],
    "triangles": [
      {"name": "triangle name", "members": ["char1", "char2", "char3"], "dynamic": "description"}
    ]
  },
  "warnings": ["warning messages"]
}`;

    try {
      console.log('[AI] Analyzing cast...');
      const result = await callAIWithMode(prompt);

      if (result.success) {
        try {
          // Try to parse response
          let data = result.data;

          // Remove markdown code blocks if present
          data = data.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

          return JSON.parse(data);
        } catch (parseError) {
          console.error('[AI] Failed to parse JSON:', parseError);
          console.log('[AI] Raw response:', result.data);

          // Try to extract JSON from response
          const jsonMatch = result.data.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          throw new Error('tekoälyn vastausta ei voitu lukea');
        }
      } else {
        console.error('[AI] API error:', result.error);
        throw new Error(failureReason(result.error));
      }
    } catch (error) {
      // The caller (Suunnittele hahmot) shows the one failure notice with this reason
      console.error('[AI] Exception:', error);
      // A reply that is not JSON, or not text at all, never shows the engine's English message
      const unreadable = error instanceof SyntaxError || error instanceof TypeError;
      throw new Error(unreadable ? 'tekoälyn vastausta ei voitu lukea' : failureReason(error));
    }
  };

  // AI Editor Analysis - Analyze chapter/scene content
  const analyzeChapterContent = async (chapterId) => {
    if (!window.electronAPI) {
      console.error('[AI Editor] Electron API not available');
      return null;
    }

    const chapter = project.structure.find(ch => ch.id === chapterId);
    if (!chapter || !chapter.content || chapter.content.trim().length < 50) {
      console.log('[AI Editor] Chapter too short to analyze');
      return null;
    }

    const prompt = `You are an expert writing analyst. Analyze this text comprehensively.

TEXT:
${chapter.content}

PROJECT CONTEXT:
- Characters: ${project.characters.map(c => c.name).join(', ')}
- Genre: ${project.genre}

Provide detailed analysis in JSON format:
{
  "synopsis": "Brief 2-3 sentence summary",
  "notesAI": {
    "characterMentions": ["character names found"],
    "locations": ["places mentioned"],
    "timeframe": "when this takes place",
    "mood": "overall emotional tone",
    "themes": ["themes present"],
    "continuityIssues": ["any contradictions or issues"]
  },
  "aiQuality": {
    "score": 7.5,
    "issues": [
      {"type": "pacing", "severity": "medium", "msg": "Middle section drags"},
      {"type": "dialogue", "severity": "low", "msg": "Some dialogue feels unnatural"}
    ],
    "strengths": ["What works well"],
    "suggestions": ["How to improve"],
    "readiness": "draft|needs-revision|ready-for-review|final"
  },
  "structureHints": {
    "shouldBeSplit": false,
    "suggestedSceneBreaks": [],
    "relatedChapters": [],
    "missingTransition": false
  },
  "pacing": {
    "speed": "slow|medium|fast",
    "tension": 7,
    "wordDensity": 15.5,
    "dialogueRatio": 0.35
  }
}

Return ONLY valid JSON.`;

    try {
      console.log('[AI Editor] Analyzing chapter:', chapterId);
      // Use Polish mode for analysis (precision over creativity). The answer is a long JSON
      // object and a reasoning model spends part of max_tokens before it: room for both
      const result = await callAIWithMode(prompt, { temperature: 0.3, max_tokens: 8000 });

      if (result.success) {
        try {
          let data = result.data.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const analysis = JSON.parse(data);

          // Update chapter with AI analysis
          setProject(prev => ({
            ...prev,
            structure: prev.structure.map(ch =>
              ch.id === chapterId
                ? {
                    ...ch,
                    synopsisAI: analysis.synopsis,
                    synopsis: ch.synopsisManual || analysis.synopsis,
                    notesAI: analysis.notesAI,
                    aiQuality: {
                      ...analysis.aiQuality,
                      lastAnalyzed: new Date().toISOString()
                    },
                    structureHints: analysis.structureHints,
                    pacing: analysis.pacing
                  }
                : ch
            )
          }));

          setUnsavedChanges(true);
          console.log('[AI Editor] Analysis complete:', analysis);
          return analysis;
        } catch (parseError) {
          console.error('[AI Editor] Parse error:', parseError);
          const jsonMatch = result.data.match(/\{[\s\S]*\}/);
          if (jsonMatch) return JSON.parse(jsonMatch[0]);
          return null;
        }
      } else {
        console.error('[AI Editor] API error:', result.error);
        return null;
      }
    } catch (error) {
      console.error('[AI Editor] Exception:', error);
      return null;
    }
  };

  // AI Editor - Generate auto-synopsis for chapter
  const generateSynopsis = async (chapterId) => {
    const chapter = project.structure.find(ch => ch.id === chapterId);
    if (!chapter || !chapter.content || chapter.content.trim().length < 50) {
      return null;
    }

    if (!window.electronAPI) return null;

    const prompt = `Summarize this chapter in 2-3 sentences (in Finnish):

${chapter.content}

Return ONLY the summary, no extra text.`;

    try {
      const result = await callAIWithMode(prompt);
      if (result.success) {
        const synopsis = result.data.trim();

        setProject(prev => ({
          ...prev,
          structure: prev.structure.map(ch =>
            ch.id === chapterId
              ? {
                  ...ch,
                  synopsisAI: synopsis,
                  synopsis: ch.synopsisManual || synopsis
                }
              : ch
          )
        }));

        setUnsavedChanges(true);
        return synopsis;
      }
    } catch (error) {
      console.error('[AI Synopsis] Error:', error);
    }
    return null;
  };

  // AI Editor - Quick quality check (lighter than full analysis)
  const quickQualityCheck = async (chapterId) => {
    const chapter = project.structure.find(ch => ch.id === chapterId);
    if (!chapter || !chapter.content || chapter.content.trim().length < 50) {
      return null;
    }

    if (!window.electronAPI) return null;

    const prompt = `Rate this text quality (1-10) and give 1-2 quick improvement suggestions:

${chapter.content.substring(0, 2000)}...

Return JSON: {"score": 7.5, "suggestions": ["suggestion1", "suggestion2"]}`;

    try {
      const result = await callAIWithMode(prompt);
      if (result.success) {
        let data = result.data.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const quality = JSON.parse(data);

        setProject(prev => ({
          ...prev,
          structure: prev.structure.map(ch =>
            ch.id === chapterId
              ? {
                  ...ch,
                  aiQuality: {
                    ...ch.aiQuality,
                    score: quality.score,
                    suggestions: quality.suggestions,
                    lastAnalyzed: new Date().toISOString()
                  }
                }
              : ch
          )
        }));

        setUnsavedChanges(true);
        return quality;
      }
    } catch (error) {
      console.error('[AI Quality] Error:', error);
    }
    return null;
  };

  // ---------------------------------------------------------------------
  // Analysoi luku, Pika-arvio, Tee tiivistelmä. The sigil buttons and the menu call these.
  // Menu items cannot be disabled, so the guards a button's disabled gives stand here too:
  // a busy guard (silent) and the 50-character guard (a notice).
  // ---------------------------------------------------------------------
  const ANALYSIS_DETAIL = 'Tarkista tekoälyn lähde, avain ja malli tietopaneelin Tekoäly-välilehdeltä.';

  const chapterHasEnoughText = () => {
    if (chapterText(activeChapter).trim().length < 50) {
      notify('warning', 'Luvussa on liian vähän tekstiä. Kirjoita ensin vähintään 50 merkkiä.');
      return false;
    }
    return true;
  };

  // Run one of the three with its busy flag and its busy notification. The notification closes before
  // the result is shown (report); both are cleared in finally.
  const runChapterAnalysis = async (kind, progressText, request, report) => {
    if (isGenerating || analysisBusy || !activeChapter) return;
    if (chapterNoAI) { notify('warning', MESSAGES.noAI); return; }
    if (!chapterHasEnoughText()) return;
    const chapterId = activeChapter.id;
    setAnalysisBusy(kind);
    showBusy(progressText);
    refusalRef.current = null;
    try {
      const result = await request(chapterId);
      closeBusy();
      const refusal = result ? null : refusalRef.current;
      if (refusal) notify(refusal.kind, refusal.text);
      else report(result, chapterId);
    } finally {
      closeBusy();
      setAnalysisBusy(null);
    }
  };

  // The stored parannusehdotukset are listed on Tietopaneeli's Luku tab (R-39)
  const runAnalyze = () => runChapterAnalysis('analyze', 'Tekoäly analysoi lukua…', analyzeChapterContent, (result) => {
    if (result) {
      notify('success', 'Analyysi valmis.', { detail: 'Laatuarvio näkyy luvun otsikon alla ja parannusehdotukset tietopaneelin Luku-välilehdellä.' });
    } else {
      notify('error', 'Analyysi epäonnistui.', { detail: ANALYSIS_DETAIL });
    }
  });

  const runQuickCheck = () => runChapterAnalysis('quick', 'Tekoäly arvioi luvun alkua…', quickQualityCheck, (result, chapterId) => {
    const score = result ? Number(result.score) : NaN;
    if (Number.isFinite(score)) {
      const suggestions = Array.isArray(result.suggestions) ? result.suggestions.map(String) : [];
      showSigilResult({ kind: 'quick', chapterId, score, suggestions });
    } else {
      notify('error', 'Pika-arvio epäonnistui.', { detail: ANALYSIS_DETAIL });
    }
  });

  const runSummary = () => runChapterAnalysis('summary', 'Tekoäly tekee tiivistelmää…', generateSynopsis, (synopsis, chapterId) => {
    if (synopsis) {
      showSigilResult({ kind: 'summary', chapterId, synopsis });
    } else {
      notify('error', 'Tiivistelmän tekeminen epäonnistui.', { detail: ANALYSIS_DETAIL });
    }
  });

  // BUG-18: before tekoäly replaces a chapter, the author's text is kept. When the text differs
  // from the chapter's current version (or there is none), it is added to the versions as
  // 'Oma teksti' (generatedFrom.mode 'manual'); the next version's id counts this one too.
  const versionsKeepingOwnText = (chapter) => {
    const versions = chapter.versions || [];
    const text = chapter.content || '';
    if (!text.trim()) return versions;
    const current = versions.find(v => v.id === chapter.currentVersion) || versions[versions.length - 1];
    if (current && current.content === text) return versions;
    return [...versions, {
      id: `v${versions.length + 1}`,
      content: text,
      timestamp: new Date().toISOString(),
      generatedFrom: {
        mode: 'manual',
        prompt: null,
        model: null,
        basedOn: chapter.currentVersion || (current ? current.id : null)
      },
      userRating: null,
      userFeedback: null,
      wordCount: countWords(text)
    }];
  };

  const AI_NOT_READY = 'Tekoälytoiminnot latautuvat vielä. Odota hetki ja yritä uudelleen.';
  const ALL_CHAPTERS_NO_AI = 'Kaikki luvut on merkitty ”Ei tekoälylle”. Mitään ei lähetetä.';

  // Magnum Opus, one chapter. Asks before it replaces a chapter that has text; nothing is
  // marked busy before the answer, so Peruuta and Esc leave no busy state.
  const generateChapter = async (chapterId) => {
    if (isGenerating || analysisBusy) return;
    // The chapter to write, open or not, is marked "Ei tekoälylle" (R-27)
    if ((project.structure.find(ch => ch.id === chapterId) || {}).noAI === true) { notify('warning', MESSAGES.noAI); return; }
    if (!window.electronAPI) {
      console.error('[Generate] Electron API not available');
      return;
    }

    if (!batchProcessorRef.current) {
      console.error('[Generate] BatchProcessor not initialized');
      notify('warning', AI_NOT_READY);
      return;
    }

    const target = project.structure.find(ch => ch.id === chapterId);
    if (!target) return;
    const targetText = chapterText(target);
    if (targetText.trim()) {
      const replace = await askConfirm(
        'Korvataanko luvun teksti?',
        `Magnum Opus: luvussa ”${target.title || 'Nimetön luku'}” on jo tekstiä (${count(countWords(targetText), 'sana')}). ` +
          'Tekoäly ei jatka sitä, vaan kirjoittaa luvun alusta ja korvaa nykyisen tekstin.\n\n' +
          'Nykyinen teksti tallennetaan ensin luvun versioksi (Oma teksti), joten voit palauttaa sen luvun versioista.',
        'Korvaa teksti',
        'Peruuta',
        { danger: true }
      );
      if (!replace) return;
    }

    setIsGenerating(true);
    setMagnumOpusRun('one');
    showBusy('Magnum Opus: valmistellaan…');

    try {
      // Find chapter index
      const chapterIndex = project.structure.findIndex(ch => ch.id === chapterId);
      if (chapterIndex === -1) {
        throw new Error('lukua ei löytynyt');
      }

      const chapter = project.structure[chapterIndex];

      // Use BatchProcessor to generate chapter
      showBusy('Magnum Opus: tekoäly kirjoittaa lukua…');

      const result = await batchProcessorRef.current.generateChapter(
        chapter.title,
        chapterIndex,
        project.ai.currentMode
      );

      if (result.success) {
        showBusy('Tallennetaan luvun tekstiä…');

        // Extract continuity data if available
        let continuityData = null;
        if (continuityTrackerRef.current && result.content) {
          showBusy('Päivitetään tarinan tietoja…');
          await continuityTrackerRef.current.extractFromChapter(chapterIndex, result.content);
          continuityData = continuityTrackerRef.current.getContextForChapter(chapterIndex + 1);
        }

        // Update chapter content with version history
        setProject(prev => ({
          ...prev,
          structure: prev.structure.map(ch => {
            if (ch.id !== chapterId) return ch;

            const versions = versionsKeepingOwnText(ch);

            // Create version object
            const newVersion = {
              id: `v${versions.length + 1}`,
              content: result.content,
              timestamp: new Date().toISOString(),
              generatedFrom: {
                mode: project.ai.currentMode,
                model: result.model || project.ai?.model || '',
                prompt: result.prompt || 'Chapter generation',
                basedOn: versions.length > 0 ? versions[versions.length - 1].id : null
              },
              userRating: null,
              userFeedback: null,
              wordCount: result.wordCount,
              cost: result.cost || 0
            };

            return {
              ...ch,
              content: result.content,
              wordCount: result.wordCount,
              versions: [...versions, newVersion],
              currentVersion: newVersion.id,
              continuityData: continuityData,
              modified: new Date().toISOString()
            };
          }),
          targets: {
            ...prev.targets,
            currentTotal: prev.structure.reduce((sum, ch) =>
              sum + (ch.id === chapterId ? result.wordCount : ch.wordCount), 0
            )
          }
        }));

        setUnsavedChanges(true);

        // Show cost info if available (after the busy notification has closed)
        closeBusy();
        notify('success', `Valmis: ${count(result.wordCount || 0, 'sana')}.` +
          (result.cost ? ` Hinta: ${formatCostFi(result.cost)}.` : ''));

        console.log('[Generate] Success:', result.wordCount, 'words', result.cost ? `$${result.cost}` : '');
      } else {
        throw new Error(result.error || 'tuntematon virhe');
      }

    } catch (error) {
      console.error('[Generate] Exception:', error);
      closeBusy();
      const asIs = asIsNotice(error);
      if (asIs) notify(asIs.kind, asIs.text);
      else notify('error', 'Luvun kirjoittaminen epäonnistui: ' + failureReason(error) + '.');
    } finally {
      closeBusy();
      setIsGenerating(false);
      setMagnumOpusRun(null);
    }
  };

  // Magnum Opus, all chapters: the question first (the button and the menu call this)
  const askAndGenerateAllChapters = async () => {
    if (isGenerating || analysisBusy) return;
    if (!batchProcessorRef.current) {
      notify('warning', AI_NOT_READY);
      return;
    }
    // Chapters marked "Ei tekoälylle" are left out of the run (contracts.md rule 16)
    const plan = bookRunPlan(project);
    if (plan.written === 0) {
      notify('warning', ALL_CHAPTERS_NO_AI);
      return;
    }
    const price = aiSource && aiSource.provider === 'cherry'
      ? 'Hinta riippuu Cherry Studiossa valitusta mallista.'
      : 'Hinta: ei arviota tälle mallille.';
    const which = plan.skipped.length === 0
      ? `Magnum Opus: tekoäly kirjoittaa jokaisen luvun (${plan.written} kpl) alusta ja korvaa lukujen nykyisen tekstin.`
      : `Magnum Opus: tekoäly kirjoittaa alusta jokaisen luvun, jota ei ole merkitty ”Ei tekoälylle” (${plan.written} kpl), ja korvaa niiden nykyisen tekstin. ` +
        `Merkityt luvut (${plan.skipped.length} kpl) jäävät ennalleen.`;
    const confirmed = await askConfirm(
      'Korvataanko kaikkien lukujen teksti?',
      which + '\n\n' +
        price + '\n\n' +
        'Tallenna ensin tilannekuva, niin voit palata nykyiseen tekstiin.',
      'Kirjoita kaikki luvut',
      'Peruuta',
      { danger: true }
    );
    if (confirmed) generateAllChapters();
  };

  // AI Generate All Chapters (Batch)
  const generateAllChapters = async () => {
    if (!window.electronAPI) {
      console.error('[Batch Generate] Electron API not available');
      return;
    }

    if (!batchProcessorRef.current) {
      console.error('[Batch Generate] BatchProcessor not initialized');
      notify('warning', AI_NOT_READY);
      return;
    }

    // The chapters marked "Ei tekoälylle" are neither written nor read: the run reads a copy of the
    // project in which they lend no text, in runs of their unprotected neighbours (rule 16)
    const base = projectRef.current || project;
    const plan = bookRunPlan(base);
    if (plan.written === 0) {
      notify('warning', ALL_CHAPTERS_NO_AI);
      return;
    }

    setIsGenerating(true);
    setMagnumOpusRun('all');
    showBusy('Magnum Opus: valmistellaan…');
    bookRunRef.current = true;
    batchProcessorRef.current.project = plan.lent;

    try {
      // Set up progress callback
      batchProcessorRef.current.onProgress = (current, total, status, info) => {
        if (status === 'starting') {
          showBusy(`Magnum Opus: tekoäly kirjoittaa lukua ${current + 1}/${total}…`);
        } else if (status === 'completed') {
          showBusy(`Luku ${current + 1}/${total} valmis: ${count((info && info.wordCount) || 0, 'sana')}.`);
        } else if (status === 'error') {
          // A failed chapter stays on screen; the run goes on with the next one. A stop or the
          // switch reads as it is (once: the same notification replaces itself)
          const asIs = asIsNotice(info && info.error);
          if (asIs) notify(asIs.kind, asIs.text);
          else notify('error', `Luvun ${current + 1} kirjoittaminen epäonnistui: ${failureReason(info && info.error)}.`);
        }
      };

      // Get chapter outlines (a protected chapter's place is kept, it is never written)
      const outlineChapters = plan.lent.structure.map(ch => ({
        title: ch.title,
        outline: ch.synopsis || ch.title
      }));

      // Process the unprotected chapters, one run of neighbours at a time; a failed run ends it
      const results = { success: true, results: [], errors: [] };
      for (const run of plan.runs) {
        const part = await batchProcessorRef.current.processChapters(
          outlineChapters,
          {
            mode: base.ai.currentMode,
            startFrom: run.startFrom,
            stopAt: run.stopAt
          }
        );
        results.results.push(...part.results);
        results.errors.push(...part.errors);
        if (!part.success) {
          results.success = false;
          break;
        }
      }
      // Each result names its chapter by its place in the book the run read
      const byId = new Map(results.results.map(result => [base.structure[result.chapterIndex].id, result]));

      if (results.success) {
        showBusy('Tallennetaan lukujen tekstiä…');

        // Extract continuity data for all chapters
        if (continuityTrackerRef.current) {
          showBusy('Päivitetään tarinan tietoja…');
          for (const result of results.results) {
            if (result?.content) {
              await continuityTrackerRef.current.extractFromChapter(result.chapterIndex, result.content);
            }
          }
        }

        // Update the written chapters with version history; a chapter marked "Ei tekoälylle" stays
        setProject(prev => {
          const structure = prev.structure.map((ch, idx) => {
            const result = ch.noAI === true ? null : byId.get(ch.id);
            if (!result) return ch;

            const versions = versionsKeepingOwnText(ch);

            // Create version object
            const newVersion = {
              id: `v${versions.length + 1}`,
              content: result.content,
              timestamp: new Date().toISOString(),
              generatedFrom: {
                mode: project.ai.currentMode,
                model: result.model || project.ai?.model || '',
                prompt: result.prompt || `Batch generation - Chapter ${idx + 1}`,
                basedOn: versions.length > 0 ? versions[versions.length - 1].id : null,
                batchGeneration: true
              },
              userRating: null,
              userFeedback: null,
              wordCount: result.wordCount,
              cost: result.cost || 0
            };

            // Get continuity data if available
            const continuityData = continuityTrackerRef.current
              ? continuityTrackerRef.current.getContextForChapter(idx + 1)
              : null;

            return {
              ...ch,
              content: result.content,
              wordCount: result.wordCount,
              versions: [...versions, newVersion],
              currentVersion: newVersion.id,
              continuityData: continuityData,
              modified: new Date().toISOString()
            };
          });
          return {
            ...prev,
            structure,
            targets: {
              ...prev.targets,
              currentTotal: structure.reduce((sum, ch) => sum + (ch.wordCount || 0), 0)
            }
          };
        });

        setUnsavedChanges(true);

        // Show summary
        const totalWords = results.results.reduce((sum, r) => sum + (r?.wordCount || 0), 0);
        const totalCost = results.totalCost || 0;
        const successCount = results.results.length;

        closeBusy();
        notify('success',
          `Valmis: ${successCount}/${plan.written} lukua, ${count(totalWords, 'sana')}. Hinta: ${formatCostFi(totalCost)}.` +
            (plan.skipped.length > 0 ? ` Ei tekoälylle -merkityt luvut (${plan.skipped.length} kpl) jäivät ennalleen.` : ''));

        console.log('[Batch Generate] Success:', successCount, 'chapters', totalWords, 'words', `$${totalCost.toFixed(4)}`);
      } else {
        const firstError = results.errors && results.errors[0] && results.errors[0].error;
        throw new Error(results.error || firstError || 'tuntematon virhe');
      }

    } catch (error) {
      console.error('[Batch Generate] Exception:', error);
      closeBusy();
      const asIs = asIsNotice(error);
      if (asIs) notify(asIs.kind, asIs.text);
      else notify('error', 'Lukujen kirjoittaminen epäonnistui: ' + failureReason(error) + '.');
    } finally {
      // The processor follows the rendered project again
      bookRunRef.current = false;
      if (batchProcessorRef.current) batchProcessorRef.current.project = projectRef.current;
      closeBusy();
      setIsGenerating(false);
      setMagnumOpusRun(null);
    }
  };

  // Kirjoita luku uudelleen (the rewrite dialog). The työtapa is the project's current one.
  // RefinementManager finds the chapter in the project it holds and writes the new version itself;
  // it is handed the project with the author's own text already kept as a version (BUG-18),
  // so the new version's number counts that one too.
  const regenerateChapter = async () => {
    if (isGenerating || analysisBusy) return;
    if (!refinementManagerRef.current) {
      notify('warning', AI_NOT_READY);
      return;
    }

    // The button is disabled while the field is empty
    const feedback = regenerateFeedback.trim();
    if (!feedback) return;

    const base = projectRef.current || project;
    const chapter = base.structure.find(ch => ch.id === activeChapterId);
    if (!chapter) return;
    const mode = base.ai.currentMode;

    setIsGenerating(true);
    showBusy('Valmistellaan…');

    try {
      // A copy: the manager pushes into the versions of the chapter it is given
      const kept = versionsKeepingOwnText(chapter);
      const prepared = { ...chapter, versions: [...kept] };
      if (kept.length > (chapter.versions || []).length) {
        prepared.currentVersion = kept[kept.length - 1].id;
      }
      refinementManagerRef.current.project = {
        ...base,
        structure: base.structure.map(ch => (ch.id === chapter.id ? prepared : ch))
      };

      showBusy('Tekoäly kirjoittaa lukua uudelleen…');

      const version = await refinementManagerRef.current.regenerateChapter(chapter.id, regenerateFeedback, mode);

      // Extract continuity data
      if (continuityTrackerRef.current && version && version.content) {
        const chapterIndex = base.structure.findIndex(ch => ch.id === chapter.id);
        if (chapterIndex !== -1) {
          await continuityTrackerRef.current.extractFromChapter(chapterIndex, version.content);
        }
      }

      setUnsavedChanges(true);
      setShowRegenerateDialog(false);
      setRegenerateFeedback('');
      const number = String((version && version.id) || '').replace(/\D/g, '');
      closeBusy();
      notify('success', `Valmis: luvun uusi teksti tallennettiin versioksi ${number}.`);
    } catch (error) {
      console.error('[Regenerate] Exception:', error);
      closeBusy();
      const asIs = asIsNotice(error);
      if (asIs) notify(asIs.kind, asIs.text);
      else notify('error', 'Luvun kirjoittaminen uudelleen epäonnistui: ' + failureReason(error) + '.');
    } finally {
      // The manager follows the rendered project again
      if (refinementManagerRef.current) refinementManagerRef.current.project = projectRef.current;
      closeBusy();
      setIsGenerating(false);
    }
  };

  // Restore Previous Version
  const restoreVersion = (versionId) => {
    if (!refinementManagerRef.current) {
      notify('warning', AI_NOT_READY);
      return;
    }

    try {
      // RefinementManager handles updating project state via setProject
      refinementManagerRef.current.restoreVersion(activeChapterId, versionId);
      setUnsavedChanges(true);
    } catch (error) {
      console.error('[Restore] Error:', error);
      notify('error', 'Version palautus epäonnistui: ' + failureReason(error) + '.');
    }
  };

  // Rate Version
  const rateVersion = (versionId, rating, feedback = null) => {
    if (!refinementManagerRef.current) {
      return;
    }

    try {
      // RefinementManager handles updating project state via setProject
      refinementManagerRef.current.rateVersion(activeChapterId, versionId, rating, feedback);
      setUnsavedChanges(true);
    } catch (error) {
      console.error('[Rate] Error:', error);
      notify('error', 'Oman arvion tallennus epäonnistui: ' + failureReason(error) + '.');
    }
  };

  // Run Consistency Check. A clean result shows in the panel (Ristiriitoja ei löytynyt.), not here.
  const runConsistencyCheck = async () => {
    if (!consistencyCheckerRef.current) {
      notify('warning', AI_NOT_READY);
      return;
    }

    setCheckingConsistency(true);
    setConsistencyChecked(false);

    try {
      const result = await consistencyCheckerRef.current.runFullCheck();

      if (result.success) {
        setConsistencyErrors(result.errors);
        console.log('[Consistency] Found', result.errors.length, 'issues');

        const failures = consistencyCheckerRef.current.failures || [];
        // A run with failed requests is not a complete result (its own warning says so)
        setConsistencyChecked(failures.length === 0);
        if (failures.length > 0) {
          notify('warning', `Tarkistus jäi kesken: ${count(failures.length, 'pyyntö')} epäonnistui, joten tulos ei ole täydellinen.`, {
            detail: failures.slice(0, 5).join('\n'),
            duration: 0
          });
        }

        // The checker writes its margin merkinnät into the chapters of the project it holds.
        // Carry them into the project state by chapter id, keeping every other annotation.
        const AI_CONSISTENCY = window.AnnotationUtils.ANNOTATION_TYPES.AI_CONSISTENCY;
        const checked = consistencyCheckerRef.current.project;
        setProject(prev => ({
          ...prev,
          structure: prev.structure.map(ch => {
            const stale = checked.structure.find(s => s.id === ch.id);
            return stale ? { ...ch, annotations: [
              ...(ch.annotations || []).filter(a => a.type !== AI_CONSISTENCY),
              ...(stale.annotations || []).filter(a => a.type === AI_CONSISTENCY)
            ] } : ch;
          })
        }));
        setUnsavedChanges(true);
      } else {
        throw new Error(result.error || 'tuntematon virhe');
      }
    } catch (error) {
      console.error('[Consistency] Error:', error);
      notify('error', 'Johdonmukaisuuden tarkistus epäonnistui: ' + failureReason(error) + '.');
    } finally {
      setCheckingConsistency(false);
    }
  };

  // Detect Plot Threads
  const detectPlotThreads = async () => {
    if (!plotThreadTrackerRef.current) {
      notify('warning', AI_NOT_READY);
      return;
    }

    setDetectingThreads(true);

    try {
      const result = await plotThreadTrackerRef.current.detectThreads(window.electronAPI);

      if (result.success) {
        // Update project with detected threads
        setProject(prev => ({
          ...prev,
          plotThreads: result.threads
        }));

        setPlotThreads(result.threads);
        setUnsavedChanges(true);

        console.log('[Plot Threads] Detected:', result.threads.length, 'threads');
      } else {
        throw new Error(result.error || 'tuntematon virhe');
      }
    } catch (error) {
      console.error('[Plot Threads] Error:', error);
      notify('error', 'Juonilankojen tunnistus epäonnistui: ' + failureReason(error) + '.');
    } finally {
      setDetectingThreads(false);
    }
  };

  // Character Builder Phase 2 - Generate clarifying questions.
  // On failure: one message here, where the reason is known, and null to the caller.
  const generateCharacterQuestions = async (characterType, realPeople, archetypeInfo) => {
    if (!window.electronAPI) {
      console.error('[Character Builder] Electron API not available');
      return null;
    }

    // A type the cast analysis gave no suggestion for has an empty archetype
    const archetype = archetypeInfo || {};

    const prompt = `You are a character psychologist helping an author create a detailed fictional character.

CHARACTER TYPE: ${characterType}
ARCHETYPE: ${archetype.archetypeFamily || ''}
REAL PEOPLE INSPIRATION: ${realPeople}

Based on the cast analysis, this character:
- Function: ${archetype.functionInStory || ''}
- Examples: ${(archetype.examples || []).join(', ')}
- Potential flaws: ${archetype.flaws || ''}

Generate 5-7 clarifying questions to help define this character's unique traits.
Questions should explore:
1. Core motivation (what drives them?)
2. Shadow aspects (hidden darkness, Jung's shadow)
3. Relationships (how do they relate to others?)
4. Voice & mannerisms (how do they speak/act?)
5. Transformation arc (how might they change?)

Return ONLY valid JSON:
{
  "questions": [
    {
      "id": 1,
      "category": "motivation",
      "question": "What is this character's deepest fear?"
    },
    ...
  ]
}`;

    try {
      console.log('[Character Builder] Generating questions...');
      const result = await callAIWithMode(prompt);

      if (result.success) {
        try {
          let data = result.data.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          return JSON.parse(data);
        } catch (parseError) {
          console.error('[Character Builder] Parse error:', parseError);
          const jsonMatch = result.data.match(/\{[\s\S]*\}/);
          if (jsonMatch) return JSON.parse(jsonMatch[0]);
          throw new Error('tekoälyn vastausta ei voitu lukea');
        }
      } else {
        console.error('[Character Builder] API error:', result.error);
        throw new Error(failureReason(result.error));
      }
    } catch (error) {
      console.error('[Character Builder] Exception:', error);
      const reason = error instanceof SyntaxError ? 'tekoälyn vastausta ei voitu lukea' : failureReason(error);
      notify('error', 'Kysymysten laatiminen epäonnistui: ' + reason + '.');
      return null;
    }
  };

  // Character Builder Phase 2 - Generate full profile.
  // On failure: one message here and null, so the builder returns to the questions with the answers kept.
  const generateCharacterProfile = async (characterType, realPeople, archetypeInfo, answers) => {
    console.log('[Character Builder] Generating profile with 4-layer model...');

    try {
      // Create CharacterGenerator instance with current provider
      const generator = new window.CharacterGenerator(
        project.ai?.provider || 'anthropic',
        project.ai?.model || null
      );
      generator.setStoryContext(project.genre || 'fiction', project.title || '');

      // Generate character using the new 4-layer system
      const result = await generator.generateCharacter({
        name: '',
        role: 'supporting', // Will be inferred from archetype
        characterType: characterType,
        realPeople: realPeople,
        answers: answers,
        archetypeInfo: archetypeInfo || {}
      });

      if (result.success) {
        // An answer the generator could not read comes back as a placeholder character: never a profile
        if (!result.character || result.character.name === 'Unnamed Character') {
          notify('error', 'Hahmon profiilin luonti epäonnistui: tekoälyn vastausta ei voitu lukea. Yritä uudelleen.');
          return null;
        }

        // Add additional metadata
        result.character.characterType = characterType;
        result.character.realPeopleInspiration = realPeople;
        result.character.archetype = archetypeInfo;
        result.character.created = new Date().toISOString();

        console.log('[Character Builder] Profile generated successfully with 4 layers:', result.character.name);
        return result.character;
      } else {
        console.error('[Character Builder] Generation failed:', result.error);
        notify('error', 'Hahmon profiilin luonti epäonnistui: ' + failureReason(result.error) + '.');
        return null;
      }
    } catch (error) {
      console.error('[Character Builder] Exception:', error);
      notify('error', 'Hahmon profiilin luonti epäonnistui: ' + failureReason(error) + '.');
      return null;
    }
  };

  // Empty every field of Uusi hahmo and go back to its first step. A request still running
  // for the earlier character is dropped (its run number is no longer current).
  const resetCharacterBuilder = () => {
    builderRunRef.current += 1;
    setCharacterBuilderStep(1);
    setSelectedCharacterType(null);
    setCharacterRealPeople('');
    setCharacterQuestions([]);
    setCharacterAnswers({});
    setCharacterProfile(null);
  };

  // Suunnittele hahmot… (and Muokkaa hahmosuunnitelmaa…): the field holds the types of the plan
  const openCastPlan = () => {
    setCastTypesDraft(((project.castPlan && project.castPlan.characterTypes) || []).join('\n'));
    castPlanRunRef.current += 1;
    setCastPlanStep(1);
    setShowCastPlanDialog(true);
  };

  // + Uusi hahmo…: always a fresh builder. Without a hahmosuunnitelma there is nothing to build
  // from, so Suunnittele hahmot opens instead. The test is the one the Hahmot window and the
  // Projekti tab use to label this button (castPlan.defined), so label and action agree.
  const openCharacterBuilder = () => {
    if (!(project.castPlan && project.castPlan.defined)) {
      openCastPlan();
      return;
    }
    resetCharacterBuilder();
    setShowCharacterBuilder(true);
  };

  // Hahmot: the window always opens on its list, never on a profile left open earlier
  const openCharacterList = () => {
    setSelectedCharacter(null);
    setCharacterSheetMode('list');
    setShowCharacterSheet(true);
  };

  // Character Builder - Handler functions
  const startCharacterBuilder = (characterType) => {
    const plan = project.castPlan || {};
    const typeIndex = (plan.characterTypes || []).indexOf(characterType);
    const archetypeInfo = (plan.suggestedArchetypes || [])[typeIndex] || {};

    // Questions, answers and a profile belong to one type: a new type starts them afresh
    builderRunRef.current += 1;
    setCharacterQuestions([]);
    setCharacterAnswers({});
    setCharacterProfile(null);
    setSelectedCharacterType({ type: characterType, archetype: archetypeInfo });
    setCharacterBuilderStep(2);
    setShowCharacterBuilder(true);
    console.log('[Character Builder] Started for:', characterType);
  };

  const handleCharacterPeopleSubmit = async () => {
    if (!characterRealPeople.trim()) {
      notify('warning', 'Kirjoita vähintään yksi nimi, esimerkiksi ”Ernst Jünger + C. G. Jung”.');
      return;
    }

    // Move to step 3 (AI generates questions)
    const run = ++builderRunRef.current;
    setCharacterBuilderStep(3);

    const questions = await generateCharacterQuestions(
      selectedCharacterType.type,
      characterRealPeople,
      selectedCharacterType.archetype
    );

    // The builder was closed, reset or moved on meanwhile: the result belongs to nobody
    if (run !== builderRunRef.current || !builderOpenRef.current) return;

    if (questions && questions.questions) {
      setCharacterQuestions(questions.questions);
      // Answers belong to the questions they were given for; the generated profile stays (BUG-12)
      setCharacterAnswers({});
      setCharacterBuilderStep(4); // Move to questions step
    } else {
      setCharacterBuilderStep(2);
    }
  };

  const handleCharacterAnswersSubmit = async () => {
    // Check if all questions are answered
    const unanswered = characterQuestions.filter(q => !characterAnswers[q.id] || !characterAnswers[q.id].trim());

    if (unanswered.length > 0) {
      const confirmed = await askConfirm(
        'Jatketaanko ilman kaikkia vastauksia?',
        `${unanswered.length} kysymykseen ei ole vastattu. Mitä tarkemmat vastaukset, sitä parempi hahmo.`,
        'Jatka silti',
        'Palaa vastaamaan'
      );
      if (!confirmed) return;
    }

    // Move to step 5 (AI generates profile)
    const run = ++builderRunRef.current;
    setCharacterBuilderStep(5);

    const profile = await generateCharacterProfile(
      selectedCharacterType.type,
      characterRealPeople,
      selectedCharacterType.archetype,
      characterAnswers
    );

    if (run !== builderRunRef.current || !builderOpenRef.current) return;

    if (profile) {
      setCharacterProfile(profile);
      setCharacterBuilderStep(6); // Move to review step
    } else {
      // The message was shown where the reason is known; the answers stay
      setCharacterBuilderStep(4);
    }
  };

  const saveCharacterProfile = () => {
    if (!characterProfile) return;

    setProject(prev => ({
      ...prev,
      characters: [...prev.characters, characterProfile]
    }));

    // Reset builder
    setShowCharacterBuilder(false);
    resetCharacterBuilder();
    setUnsavedChanges(true);

    console.log('[Character Builder] Profile saved:', characterProfile.name);
  };

  // Peruuta in Uusi hahmo: asks only when something would be lost
  const cancelCharacterBuilder = async () => {
    const hasInput = characterRealPeople.trim() ||
      Object.values(characterAnswers).some(answer => answer && String(answer).trim()) ||
      characterProfile;
    if (hasInput) {
      const discard = await askConfirm(
        'Hylätäänkö keskeneräinen hahmo?',
        'Antamasi tiedot ja vastaukset häviävät.',
        'Hylkää hahmo',
        'Jatka muokkausta',
        { danger: true }
      );
      if (!discard) return;
    }

    setShowCharacterBuilder(false);
    resetCharacterBuilder();
  };

  // Voice Edit Selected Text
  const editByVoice = async (selectedText, voiceInstruction) => {
    if (!window.electronAPI) {
      console.error('[Voice] Electron API not available');
      return null;
    }

    const currentMode = getCurrentMode();

    const prompt = `ORIGINAL TEXT:
${selectedText}

USER INSTRUCTION (spoken):
"${voiceInstruction}"

TASK:
Rewrite the text following the instruction.
Preserve the general meaning but apply the requested change.
${currentMode.systemPrompt}

Return ONLY the rewritten text, no explanations or extra commentary.`;

    try {
      console.log('[Voice] Sending to AI...');
      setVoiceState('processing');

      const result = await callAIWithMode(prompt);

      if (result.success) {
        console.log('[Voice] AI response received');
        setVoiceState('idle');
        return {
          original: selectedText,
          revised: result.data.trim(),
          instruction: voiceInstruction
        };
      } else {
        console.error('[Voice] AI error:', result.error);
        const asIs = asIsNotice(result.error);
        if (asIs) notify(asIs.kind, asIs.text);
        else notify('error', 'Tekstin muokkaus epäonnistui: ' + failureReason(result.error) + '.');
        setVoiceState('error');
        return null;
      }
    } catch (error) {
      console.error('[Voice] Exception:', error);
      const asIs = asIsNotice(error);
      if (asIs) notify(asIs.kind, asIs.text);
      else notify('error', 'Tekstin muokkaus epäonnistui: ' + failureReason(error) + '.');
      setVoiceState('error');
      return null;
    }
  };

  // Muokkaa valintaa puhumalla: the voice button and Työkalut ▸ Tekoäly call this
  const handleVoiceEdit = async () => {
    if (chapterNoAI) { notify('warning', MESSAGES.noAI); return; }
    if (!textSelection || !textSelection.text.trim()) {
      notify('warning', 'Valitse ensin teksti, jota haluat muokata.');
      return;
    }

    if (!voiceInputRef.current) {
      notify('error', 'Puheentunnistus ei ole käytettävissä.');
      return;
    }

    // A new voice edit replaces the comparison of the previous one
    setVoiceDiffView(null);
    try {
      voiceOwnerRef.current = 'editor';
      setVoiceState('listening');
      console.log('[Voice] Listening for instruction...');

      const result = await voiceInputRef.current.listen();

      if (result && result.transcript) {
        console.log('[Voice] Heard:', result.transcript);

        if (result.confidence < 0.5) {
          // Nothing is busy while the question is open
          setVoiceState('idle');
          const confirmed = await askConfirm(
            'Käytetäänkö tätä ohjetta?',
            `Puheesta tunnistettiin: ”${result.transcript}”\n\n` +
              'Jos ohje on oikein, valittua tekstiä muokataan sen mukaan ja saat ehdotuksen hyväksyttäväksi.',
            'Käytä ohjetta',
            'Peruuta'
          );
          if (!confirmed) return;
        }

        // Send to AI; the result goes back to what was sent, wherever it stands then
        const target = sentTarget(activeChapter.id, textSelection, projectEpochRef.current);
        const diffResult = await editByVoice(textSelection.text, result.transcript);

        if (diffResult) {
          // A result for a project that is no longer open is not shown (rule 14)
          if (target.epoch !== projectEpochRef.current) return;
          oldPathTargetRef.current.voice = target;
          setVoiceDiffView(diffResult);
        } else {
          // editByVoice left the button in its error state: back to idle as after any error
          setTimeout(() => setVoiceState('idle'), 2000);
        }
      } else {
        // Nothing was heard
        setVoiceState('idle');
      }
    } catch (error) {
      console.error('[Voice] Error:', error);
      notify('error', 'Tekstin muokkaus epäonnistui: ' + voiceFailureReason(error) + '.');
      setVoiceState('error');
      setTimeout(() => setVoiceState('idle'), 2000);
    }
  };

  // The text an old path sent is found again: at its stored place, else at its one occurrence (5.7);
  // never in another chapter or another project
  const OLD_PATH_CHANGED = 'Teksti on muuttunut ehdotuksen luomisen jälkeen. Muutosta ei tehty.';
  const placeOldPathText = (target, revised) => {
    const liveText = editorRef.current ? editorRef.current.value : activeChapter.content;
    const placed = placeSentText(liveText, target, { chapterId: activeChapter.id, epoch: projectEpochRef.current }, revised);
    if (placed === null) notify('warning', OLD_PATH_CHANGED);
    return placed;
  };

  // Accept voice edit: the ehdotus replaces the text that was sent, not the selection of the moment
  const acceptVoiceEdit = () => {
    if (!voiceDiffView) return;
    const newContent = placeOldPathText(oldPathTargetRef.current.voice, voiceDiffView.revised);
    if (newContent === null) return;

    updateChapterContent(newContent, false, { noMerge: true });

    // Clear diff view and selection
    setVoiceDiffView(null);
    setTextSelection(null);
    console.log('[Voice] Edit accepted');
  };

  // Reject voice edit
  const rejectVoiceEdit = () => {
    setVoiceDiffView(null);
    console.log('[Voice] Edit rejected');
  };

  // Continue Writing from current cursor position
  const handleContinueWriting = async () => {
    if (!activeChapter || !hybridFlowRef.current) {
      console.error('[HybridFlow] No active chapter or hybrid flow not initialized');
      return;
    }

    setContinuingWriting(true);
    setContinuePreview('');

    try {
      const epoch = projectEpochRef.current;
      const result = await hybridFlowRef.current.continueFromText(
        activeChapterIndex,
        activeChapter.content,
        {
          paragraphs: continueParagraphs,
          mode: project.ai.currentMode
        }
      );
      if (epoch !== projectEpochRef.current) return;   // another project is open now (rule 14)

      if (result.success) {
        setContinuePreview(result.continuation);
        console.log('[HybridFlow] Generated continuation:', result.continuation.substring(0, 100) + '...');
      } else {
        const asIs = asIsNotice(result.error);
        if (asIs) notify(asIs.kind, asIs.text);
        else notify('error', 'Ehdotuksen luonti epäonnistui: ' + failureReason(result.error) + '.');
      }
    } catch (error) {
      console.error('[HybridFlow] Error:', error);
      const asIs = asIsNotice(error);
      if (asIs) notify(asIs.kind, asIs.text);
      else notify('error', 'Ehdotuksen luonti epäonnistui: ' + failureReason(error) + '.');
    } finally {
      setContinuingWriting(false);
    }
  };

  // Kirjoita tekoälyn kanssa ▸ Lisää luvun loppuun: the ehdotus goes after the chapter's text.
  // Every kind of ehdotus can be added this way (continuation, from a summary, a scene).
  const acceptContinuation = () => {
    if (!continuePreview || !activeChapter) return;

    const base = chapterText(activeChapter);
    const newContent = base.trim() ? base + '\n\n' + continuePreview : continuePreview;
    updateChapterContent(newContent, false, { noMerge: true });

    setContinuePreview('');
    setShowContinueDialog(false);
    setHybridInput('');
    console.log('[HybridFlow] Continuation accepted');
  };

  // Hylkää: the ehdotus goes; the dialog stays on its form with the input kept
  const rejectContinuation = () => {
    setContinuePreview('');
    console.log('[HybridFlow] Continuation rejected');
  };

  // Kirjoita tekoälyn kanssa from the Tekoäly tab or the menu. On an empty chapter there is
  // nothing to continue, so the dialog opens on Kirjoita kohtaus.
  const openAiWriting = () => {
    if (!activeChapter) {
      notify('warning', 'Avaa ensin luku.');
      return;
    }
    if (chapterNoAI) { notify('warning', MESSAGES.noAI); return; }
    if (!hybridFlowRef.current) {
      notify('warning', 'Tekoälytoiminnot latautuvat vielä.');
      return;
    }
    if (!chapterText(activeChapter).trim()) setHybridMode('scene');
    setShowContinueDialog(true);
  };

  // Expand outline using HybridWritingFlow
  const handleExpandOutline = async () => {
    if (!activeChapter || !hybridFlowRef.current || !hybridInput.trim()) {
      console.error('[HybridFlow] Missing requirements for expand');
      return;
    }

    setContinuingWriting(true);
    setContinuePreview('');

    try {
      const epoch = projectEpochRef.current;
      const result = await hybridFlowRef.current.expandOutline(
        activeChapterIndex,
        hybridInput,
        {
          targetWords: hybridTargetWords,
          style: hybridStyle,
          mode: project.ai.currentMode
        }
      );
      if (epoch !== projectEpochRef.current) return;   // another project is open now (rule 14)

      if (result.success) {
        setContinuePreview(result.content);
        console.log('[HybridFlow] Outline expanded:', result.wordCount, 'words');
      } else {
        const asIs = asIsNotice(result.error);
        if (asIs) notify(asIs.kind, asIs.text);
        else notify('error', 'Ehdotuksen luonti epäonnistui: ' + failureReason(result.error) + '.');
      }
    } catch (error) {
      console.error('[HybridFlow] Expand error:', error);
      const asIs = asIsNotice(error);
      if (asIs) notify(asIs.kind, asIs.text);
      else notify('error', 'Ehdotuksen luonti epäonnistui: ' + failureReason(error) + '.');
    } finally {
      setContinuingWriting(false);
    }
  };

  // Rewrite section using HybridWritingFlow
  const handleRewriteSection = async () => {
    if (!textSelection?.text || !hybridFlowRef.current || !hybridInput.trim()) {
      console.error('[HybridFlow] Missing requirements for rewrite');
      return;
    }

    setContinuingWriting(true);
    setContinuePreview('');

    try {
      const target = sentTarget(activeChapter.id, textSelection, projectEpochRef.current);
      const result = await hybridFlowRef.current.rewriteSection(
        textSelection.text,
        hybridInput,
        { mode: project.ai.currentMode }
      );
      if (target.epoch !== projectEpochRef.current) return;   // another project is open now (rule 14)

      if (result.success) {
        oldPathTargetRef.current.rewrite = target;
        setContinuePreview(result.rewritten);
        console.log('[HybridFlow] Section rewritten');
      } else {
        const asIs = asIsNotice(result.error);
        if (asIs) notify(asIs.kind, asIs.text);
        else notify('error', 'Ehdotuksen luonti epäonnistui: ' + failureReason(result.error) + '.');
      }
    } catch (error) {
      console.error('[HybridFlow] Rewrite error:', error);
      const asIs = asIsNotice(error);
      if (asIs) notify(asIs.kind, asIs.text);
      else notify('error', 'Ehdotuksen luonti epäonnistui: ' + failureReason(error) + '.');
    } finally {
      setContinuingWriting(false);
    }
  };

  // Generate scene using HybridWritingFlow
  const handleGenerateScene = async () => {
    if (!activeChapter || !hybridFlowRef.current || !hybridInput.trim()) {
      console.error('[HybridFlow] Missing requirements for scene');
      return;
    }

    setContinuingWriting(true);
    setContinuePreview('');

    try {
      const epoch = projectEpochRef.current;
      const length = hybridTargetWords <= 600 ? 'short' : hybridTargetWords >= 1500 ? 'long' : 'medium';
      const result = await hybridFlowRef.current.generateScene(
        activeChapterIndex,
        hybridInput,
        {
          length,
          focus: hybridStyle === 'dialogue-heavy' ? 'dialogue' : 'balanced',
          mode: project.ai.currentMode
        }
      );
      if (epoch !== projectEpochRef.current) return;   // another project is open now (rule 14)

      if (result.success) {
        setContinuePreview(result.scene);
        console.log('[HybridFlow] Scene generated:', result.wordCount, 'words');
      } else {
        const asIs = asIsNotice(result.error);
        if (asIs) notify(asIs.kind, asIs.text);
        else notify('error', 'Ehdotuksen luonti epäonnistui: ' + failureReason(result.error) + '.');
      }
    } catch (error) {
      console.error('[HybridFlow] Scene error:', error);
      const asIs = asIsNotice(error);
      if (asIs) notify(asIs.kind, asIs.text);
      else notify('error', 'Ehdotuksen luonti epäonnistui: ' + failureReason(error) + '.');
    } finally {
      setContinuingWriting(false);
    }
  };

  // Accept rewrite: replaces the text that was sent for rewriting
  const acceptRewrite = () => {
    if (!continuePreview || !activeChapter) return;
    const newContent = placeOldPathText(oldPathTargetRef.current.rewrite, continuePreview);
    if (newContent === null) return;

    updateChapterContent(newContent, false, { noMerge: true });
    setContinuePreview('');
    setShowContinueDialog(false);
    setTextSelection(null);
    setHybridInput('');
    console.log('[HybridFlow] Rewrite accepted');
  };

  // Korvaa koko luku…: a scene or an ehdotus from a summary replaces the whole chapter, after a question
  const acceptExpansion = async () => {
    if (!continuePreview || !activeChapter) return;

    if (!(await askConfirm(
      'Korvataanko koko luku?',
      'Luvun nykyinen teksti korvataan ehdotuksella. Voit kumota muutoksen valitsemalla Muokkaa → Kumoa.',
      'Korvaa luku',
      'Peruuta',
      { danger: true }
    ))) return;

    // For expand/scene, replace entire chapter content
    updateChapterContent(continuePreview, false, { noMerge: true });
    setContinuePreview('');
    setShowContinueDialog(false);
    setHybridInput('');
    console.log('[HybridFlow] Expansion accepted');
  };

  // Track text selection in editor
  const handleTextSelection = () => {
    if (!editorRef.current) return;

    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end) {
      const selectedText = textarea.value.substring(start, end);
      setTextSelection({ text: selectedText, start, end });
      console.log('[Voice] Text selected:', selectedText.substring(0, 50) + '...');
    } else {
      setTextSelection(null);
    }
  };

  // Initialize session when component mounts or project loads
  useEffect(() => {
    if (!sessionStartTime && project.structure) {
      const totalWords = project.structure.reduce((sum, ch) => {
        return sum + (ch.content ? ch.content.split(/\s+/).filter(Boolean).length : 0);
      }, 0);
      setSessionStartWords(totalWords);
      setSessionStartTime(new Date());
      console.log('[Session] Started with', totalWords, 'words');
    }
  }, [project.structure, sessionStartTime]);

  // Calculate session progress
  const getSessionProgress = () => {
    if (!project.structure) return { written: 0, goal: sessionGoal, percentage: 0 };

    const currentWords = project.structure.reduce((sum, ch) => {
      return sum + (ch.content ? ch.content.split(/\s+/).filter(Boolean).length : 0);
    }, 0);

    const written = Math.max(0, currentWords - sessionStartWords);
    const percentage = Math.min(100, Math.round((written / sessionGoal) * 100));

    return { written, goal: sessionGoal, percentage, currentWords };
  };

  // Reset session
  const resetSession = () => {
    const totalWords = project.structure.reduce((sum, ch) => {
      return sum + (ch.content ? ch.content.split(/\s+/).filter(Boolean).length : 0);
    }, 0);
    setSessionStartWords(totalWords);
    setSessionStartTime(new Date());
    console.log('[Session] Reset with', totalWords, 'words');
  };

  // Save typewriter mode preference
  useEffect(() => {
    localStorage.setItem('faust-typewriter-mode', typewriterMode.toString());
  }, [typewriterMode]);

  // Save session goal preference
  useEffect(() => {
    localStorage.setItem('faust-session-goal', sessionGoal.toString());
  }, [sessionGoal]);

  // Editor dimensions tracking for AnnotationMargin
  const [editorDimensions, setEditorDimensions] = useState({
    scrollTop: 0,
    clientHeight: 0,
    scrollHeight: 0
  });

  // Track editor scroll and dimensions
  useEffect(() => {
    const updateEditorDimensions = () => {
      if (editorRef.current) {
        setEditorDimensions({
          scrollTop: editorRef.current.scrollTop,
          clientHeight: editorRef.current.clientHeight,
          scrollHeight: editorRef.current.scrollHeight
        });
      }
    };

    // Initial measurement
    updateEditorDimensions();

    // Add scroll listener
    if (editorRef.current) {
      editorRef.current.addEventListener('scroll', updateEditorDimensions);
    }

    // Update on window resize
    window.addEventListener('resize', updateEditorDimensions);

    // The first measurement can come before the fonts and the text have their final height:
    // measure again when the web fonts are in and whenever the scroller or its content resizes.
    let alive = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) updateEditorDimensions(); });
    let resizeObserver = null;
    if (editorRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(updateEditorDimensions);
      resizeObserver.observe(editorRef.current);
      Array.from(editorRef.current.children).forEach(child => resizeObserver.observe(child));
    }

    return () => {
      alive = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (editorRef.current) {
        editorRef.current.removeEventListener('scroll', updateEditorDimensions);
      }
      window.removeEventListener('resize', updateEditorDimensions);
    };
  }, [activeChapterId]); // Re-attach listeners when chapter changes

  // Annotation handlers
  const handleAnnotationClick = (annotation) => {
    console.log('[Annotation] Clicked:', annotation);
    // TODO: Show annotation details in a tooltip or modal
  };

  const handleCreateAnnotation = (position, length, content) => {
    if (!activeChapter) return;

    const newAnnotation = window.AnnotationUtils.createAnnotation({
      type: window.AnnotationUtils.ANNOTATION_TYPES.USER_NOTE,
      position,
      length,
      content,
      priority: window.AnnotationUtils.ANNOTATION_PRIORITY.INFO
    });

    setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === activeChapterId
          ? { ...ch, annotations: [...(ch.annotations || []), newAnnotation] }
          : ch
      )
    }));

    setUnsavedChanges(true);
    console.log('[Annotation] Created:', newAnnotation);
  };

  const handleUpdateAnnotation = (annotationId, updates) => {
    if (!activeChapter) return;

    setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === activeChapterId
          ? {
              ...ch,
              annotations: (ch.annotations || []).map(ann =>
                ann.id === annotationId
                  ? window.AnnotationUtils.updateAnnotation(ann, updates)
                  : ann
              )
            }
          : ch
      )
    }));

    setUnsavedChanges(true);
    console.log('[Annotation] Updated:', annotationId);
  };

  const handleDeleteAnnotation = (annotationId) => {
    if (!activeChapter) return;

    setProject(prev => ({
      ...prev,
      structure: prev.structure.map(ch =>
        ch.id === activeChapterId
          ? {
              ...ch,
              annotations: (ch.annotations || []).filter(ann => ann.id !== annotationId)
            }
          : ch
      )
    }));

    setUnsavedChanges(true);
    console.log('[Annotation] Deleted:', annotationId);
  };

  // AI Assistant Panel - Send message with model selection
  const sendAiAssistantMessage = async () => {
    if (!aiChatInput.trim()) return;
    if (!window.electronAPI) {
      console.error('[AI Assistant] Electron API not available');
      return;
    }

    const userMessage = aiChatInput.trim();
    // In a chapter marked "Ei tekoälylle" the message goes without the selection
    const selectedText = chapterNoAI ? '' : (textSelection?.text || '');
    // What is sent with the message; the ehdotus shown for an earlier selection goes, as this one replaces it
    const target = selectedText ? sentTarget(activeChapter.id, textSelection, projectEpochRef.current) : null;
    if (target) setAiSuggestion(null);

    // Add user message to chat
    setAiChatMessages(prev => [...prev, { role: 'user', content: userMessage, selectedText }]);
    setAiChatInput('');
    setAiChatProcessing(true);

    // Build memory context from recent important decisions
    const memoryContext = chatMemory.entries
      .filter(e => e.type === 'decision' || e.type === 'direction')
      .slice(-5)
      .map(e => `- ${e.summary}`)
      .join('\n');

    // Build context-aware prompt
    const currentMode = getCurrentMode();
    const contextPrompt = selectedText
      ? `The user has selected this text:\n"""${selectedText}"""\n\nUser instruction: ${userMessage}\n\nPlease provide a revised version of the selected text based on the instruction.`
      : `User question: ${userMessage}\n\nRespond helpfully about their writing project.`;

    const fullPrompt = `You are FAUST AI Assistant, helping with creative writing.

PROJECT CONTEXT:
- Title: ${project.title}
- Current chapter: ${activeChapter.title}
- AI Mode: ${project.ai.currentMode} (${currentMode.useCase})
- Progress: ${totalWords} / ${project.targets.totalWords} words

${memoryContext ? `RECENT DECISIONS & DIRECTIONS:\n${memoryContext}\n` : ''}
${contextPrompt}`;

    try {
      // The old handler: without a stored model main uses the configured one
      const modelName = project.ai?.model || undefined;
      const result = await window.electronAPI.claudeAPI({ prompt: fullPrompt, model: modelName });

      if (result?.success) {
        const responseText = result.data.trim();
        setAiChatMessages(prev => [...prev, { role: 'assistant', content: responseText }]);

        // Save to chat memory if it's about decisions or directions
        const isImportant = userMessage.toLowerCase().match(
          /decide|plan|direction|character|plot|theme|structure|approach|strategy|goal|want to|should|going to/
        );

        if (isImportant && window.electronAPI.saveChatMemory) {
          await window.electronAPI.saveChatMemory({
            type: 'decision',
            summary: userMessage.length > 100 ? userMessage.substring(0, 97) + '...' : userMessage,
            userMessage,
            aiResponse: responseText.substring(0, 200),
            project: project.title,
            chapter: activeChapter.title
          });
          console.log('[Chat Memory] Saved important message');
        }

        // If there was selected text, show as suggestion (not in a project opened meanwhile, rule 14)
        if (target && target.epoch === projectEpochRef.current) {
          oldPathTargetRef.current.liminal = target;
          setAiSuggestion({
            original: selectedText,
            revised: responseText,
            applied: false
          });
        }
      } else {
        // The speaker label already reads Virhe; a stop, the switch or the wire guard reads as it is
        const asIs = asIsNotice(result && result.error);
        setAiChatMessages(prev => [...prev, { role: 'error', content: asIs ? asIs.text : failureReason(result && result.error) }]);
      }
    } catch (error) {
      console.error('[AI Assistant] Error:', error);
      const asIs = asIsNotice(error);
      setAiChatMessages(prev => [...prev, { role: 'error', content: asIs ? asIs.text : failureReason(error) }]);
    } finally {
      setAiChatProcessing(false);
    }
  };

  // AI Assistant - Voice input
  const handleAiAssistantVoice = async () => {
    if (!voiceInputRef.current) {
      notify('error', 'Puheentunnistus ei ole käytettävissä.');
      return;
    }

    try {
      voiceOwnerRef.current = 'engine';
      setAiChatVoiceState('listening');
      console.log('[AI Assistant Voice] Listening...');

      const result = await voiceInputRef.current.listen();

      if (result && result.transcript) {
        console.log('[AI Assistant Voice] Heard:', result.transcript);

        if (result.confidence < 0.5) {
          // Nothing is busy while the question is open
          setAiChatVoiceState('idle');
          const confirmed = await askConfirm(
            'Lisätäänkö teksti viestiin?',
            `Puheesta tunnistettiin: ”${result.transcript}”\n\n` +
              'Jos teksti on oikein, se lisätään viestikenttään.',
            'Lisää teksti',
            'Peruuta'
          );
          if (!confirmed) return;
        }

        // The heard text goes into the message field after what is already there; nothing is sent
        setAiChatInput(prev => (prev && prev.trim() ? prev + ' ' + result.transcript : result.transcript));
        setAiChatVoiceState('idle');
      } else {
        setAiChatVoiceState('idle');
      }
    } catch (error) {
      console.error('[AI Assistant Voice] Error:', error);
      notify('error', 'Sanelu epäonnistui: ' + voiceFailureReason(error) + '.');
      setAiChatVoiceState('error');
      setTimeout(() => setAiChatVoiceState('idle'), 2000);
    }
  };

  // AI Assistant - Korvaa valittu teksti: the answer replaces the selection that was sent (BUG-6, R-18)
  const applyAiSuggestion = () => {
    if (!aiSuggestion) return;
    const newContent = placeOldPathText(oldPathTargetRef.current.liminal, aiSuggestion.revised);
    if (newContent === null) return;
    updateChapterContent(newContent, false, { noMerge: true });
    setAiSuggestion({ ...aiSuggestion, applied: true });
    setTextSelection(null);
  };

  // Load chat memory on mount
  useEffect(() => {
    const loadMemory = async () => {
      if (window.electronAPI?.loadChatMemory) {
        const result = await window.electronAPI.loadChatMemory();
        if (result.success) {
          setChatMemory(result.data);
          console.log('[Chat Memory] Loaded', result.data.entries?.length || 0, 'entries');
        }
      }
    };
    loadMemory();
  }, []);

  // Initialize voice input on mount
  useEffect(() => {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      // Dynamically load VoiceInput class
      const script = document.createElement('script');
      script.src = './src/utils/voiceInput.js';
      script.onerror = (err) => {
        console.error('[Voice] Failed to load voiceInput.js:', err);
      };
      script.onload = () => {
        try {
          // VoiceInput is now globally available
          if (window.VoiceInput) {
            const voiceInput = new window.VoiceInput('fi-FI');
            voiceInput.onStateChange = (state) => {
              console.log('[Voice] State change:', state);
              // The editor's voice bar follows the input only while the editor owns it
              if (voiceOwnerRef.current !== 'editor') return;
              if (state === 'listening') setVoiceState('listening');
              else if (state === 'idle') setVoiceState('idle');
            };
            voiceInputRef.current = voiceInput;
            setVoiceInputAvailable(true);
            console.log('[Voice] Voice input initialized');

            const browserWarning = window.VoiceInput.getBrowserRecommendation();
            if (browserWarning) {
              console.warn('[Voice]', browserWarning);
            }
          }
        } catch (error) {
          console.error('[Voice] Failed to initialize:', error);
        }
      };
      document.head.appendChild(script);
    } else {
      console.warn('[Voice] Web Speech API not supported');
    }
  }, []);

  // Initialize AI modules on mount
  useEffect(() => {
    const loadAIModules = async () => {
      try {
        // Load all AI module scripts
        const modules = [
          { name: 'BatchProcessor', src: './src/services/ai/BatchProcessor.js' },
          { name: 'CostOptimizer', src: './src/services/ai/CostOptimizer.js' },
          { name: 'StoryContinuityTracker', src: './src/services/ai/StoryContinuityTracker.js' },
          { name: 'HybridWritingFlow', src: './src/services/ai/HybridWritingFlow.js' },
          { name: 'RefinementManager', src: './src/services/ai/RefinementManager.js' },
          { name: 'PlotThreadTracker', src: './src/services/story/PlotThreadTracker.js' },
          { name: 'ConsistencyChecker', src: './src/services/validation/ConsistencyChecker.js' }
        ];

        const loadScript = (src) => {
          return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            // Don't use type='module' - we want regular scripts that expose globals
            script.onload = () => resolve();
            script.onerror = (err) => reject(err);
            document.head.appendChild(script);
          });
        };

        // Load all scripts
        for (const module of modules) {
          try {
            await loadScript(module.src);
            console.log(`[AI] Loaded ${module.name}`);
          } catch (err) {
            console.error(`[AI] Failed to load ${module.name}:`, err);
          }
        }

        // Wait a bit for modules to be available globally
        setTimeout(() => {
          try {
            // Initialize modules
            if (window.CostOptimizer) {
              costOptimizerRef.current = new window.CostOptimizer(project);
              console.log('[AI] CostOptimizer initialized');
            }

            if (window.StoryContinuityTracker) {
              continuityTrackerRef.current = new window.StoryContinuityTracker(project);
              console.log('[AI] StoryContinuityTracker initialized');
            }

            if (window.HybridWritingFlow) {
              hybridFlowRef.current = new window.HybridWritingFlow(
                window.electronAPI,
                project,
                continuityTrackerRef.current
              );
              console.log('[AI] HybridWritingFlow initialized');
            }

            if (window.BatchProcessor) {
              batchProcessorRef.current = new window.BatchProcessor(
                window.electronAPI,
                project,
                costOptimizerRef.current,
                continuityTrackerRef.current,
                callAIStable // AI mode-aware call, always the current one
              );
              console.log('[AI] BatchProcessor initialized with AI Writing Modes');
            }

            // Initialize RefinementManager from dynamically loaded module
            refinementManagerRef.current = new window.RefinementManager(
              project,
              setProject,
              refinementCall // the reply as text; a failed request throws
            );
            console.log('[AI] RefinementManager initialized');

            if (window.PlotThreadTracker) {
              plotThreadTrackerRef.current = new window.PlotThreadTracker(project);
              console.log('[AI] PlotThreadTracker initialized');
            }

            if (window.ConsistencyChecker) {
              consistencyCheckerRef.current = new window.ConsistencyChecker(
                project,
                window.electronAPI,
                callAIStable  // AI mode-aware call, always the current one
              );
              console.log('[AI] ConsistencyChecker initialized with AI Writing Modes');
            }

            console.log('[AI] All AI modules initialized successfully');
          } catch (error) {
            console.error('[AI] Failed to initialize modules:', error);
          }
        }, 100);
      } catch (error) {
        console.error('[AI] Error loading AI modules:', error);
      }
    };

    loadAIModules();
  }, []); // Load only once on mount, not on every project change

  // Update project references in AI modules when project changes
  useEffect(() => {
    if (costOptimizerRef.current) {
      costOptimizerRef.current.project = project;
    }
    if (continuityTrackerRef.current) {
      continuityTrackerRef.current.project = project;
    }
    if (hybridFlowRef.current) {
      hybridFlowRef.current.project = project;
    }
    if (batchProcessorRef.current) {
      // During a whole-book run the chapters marked "Ei tekoälylle" lend no text (rule 16)
      batchProcessorRef.current.project = bookRunRef.current ? bookRunPlan(project).lent : project;
    }
    if (refinementManagerRef.current) {
      refinementManagerRef.current.project = project;
    }
    if (plotThreadTrackerRef.current) {
      plotThreadTrackerRef.current.project = project;
    }
    if (consistencyCheckerRef.current) {
      consistencyCheckerRef.current.project = project;
      consistencyCheckerRef.current.electronAPI = window.electronAPI;
      consistencyCheckerRef.current.callAIWithMode = callAIStable;
    }
  }, [project]);

  // Autosave: a project that has a file is written every 30 seconds while it
  // has unsaved changes. (A timer restarted by every keystroke would never
  // fire for someone who keeps writing.)
  useEffect(() => {
    if (!unsavedChanges || !currentFilePath || !window.electronAPI) return;

    const autosave = async () => {
      flushCodexDrafts();
      const saving = projectRef.current;
      try {
        setSavingState('saving');
        const result = await window.electronAPI.autosaveProject({
          projectData: saving,
          filePath: currentFilePath
        });
        if (!result.success) throw new Error(result.error || 'tuntematon virhe');

        // Typing during the save keeps the project marked as changed
        if (projectRef.current === saving && !codexDraftsPending()) {
          setUnsavedChanges(false);
          window.electronAPI.clearBackup();
        }
        setAutosaveError(null);
        setSavingState('saved');
        setTimeout(() => setSavingState('idle'), 2000);
      } catch (error) {
        // The interval tries again in 30 seconds; the recovery copy covers the gap
        console.error('[Autosave] Error:', error);
        setAutosaveError('Automaattinen tallennus epäonnistui: ' + saveFailureReason(error) +
          '. Tallenna valitsemalla Tiedosto → Tallenna (' + shortcut('CmdOrCtrl+S') + ').');
        setSavingState('error');
      }
    };

    const timer = setInterval(autosave, 30000);
    return () => clearInterval(timer);
  }, [unsavedChanges, currentFilePath]);

  // Recovery copy: while there are unsaved changes, a copy is kept outside
  // the project file. Saving removes it; after a crash it is offered at start.
  useEffect(() => {
    if (!unsavedChanges || !window.electronAPI || !window.electronAPI.saveBackup) return;

    const write = () => {
      window.electronAPI.saveBackup({ project: projectRef.current, filePath: currentFilePath });
    };

    const first = setTimeout(write, 3000);
    const timer = setInterval(write, 20000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [unsavedChanges, currentFilePath]);

  // Offer the recovery copy of an interrupted session
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!window.electronAPI || !window.electronAPI.loadBackup) return;

      const recovery = await window.electronAPI.loadBackup();
      if (cancelled || !recovery.success) return;

      const data = normalizeProject(recovery.project);
      if (!data) {
        window.electronAPI.clearBackup();
        return;
      }

      // Esc and the scrim answer nothing here: only a click on a button decides, and the
      // discarding button is the red one on the left
      const name = (data.title || '').trim() || 'Nimetön projekti';
      const when = formatDateTimeFi(recovery.savedAt);
      const saved = when ? ` (tallennettu ${when})` : '';
      const fileName = recovery.filePath ? recovery.filePath.split(/[\\/]/).pop() : '';
      const restore = recovery.filePath
        ? await askConfirm(
          'Palautetaanko tallentamattomat muutokset?',
          `FAUST sulkeutui viime kerralla kesken työn. Projektista ”${name}” (${fileName}) jäi varmuuskopio${saved}.\n\n` +
            'Jos palautat, varmuuskopio avataan ja automaattitallennus tallentaa sen pian tiedoston päälle. ' +
            'Jos hylkäät muutokset, varmuuskopio poistetaan pysyvästi ja tiedosto jää ennalleen.',
          'Palauta muutokset',
          'Hylkää muutokset',
          { requireChoice: true, dangerCancel: true }
        )
        : await askConfirm(
          'Palautetaanko tallentamaton projekti?',
          `FAUST sulkeutui viime kerralla kesken työn. Projektia ”${name}” ei ollut tallennettu tiedostoon, mutta siitä jäi varmuuskopio${saved}.\n\n` +
            `Jos palautat, projekti avautuu ilman tiedostoa: tallenna se valitsemalla Tiedosto → Tallenna (${shortcut('CmdOrCtrl+S')}). ` +
            'Jos poistat varmuuskopion, koko projekti menetetään pysyvästi.',
          'Palauta projekti',
          'Poista varmuuskopio',
          { requireChoice: true, dangerCancel: true }
        );
      if (cancelled) return;

      if (restore) {
        openProject(data, recovery.filePath || null);
        setUnsavedChanges(true);
      } else if (restore === false) {
        window.electronAPI.clearBackup();
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Tell the main process about unsaved changes: it asks before the window closes
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.setDirty) {
      window.electronAPI.setDirty(unsavedChanges);
    }
  }, [unsavedChanges]);

  // Mark the search matches in the editor and keep the current one in view.
  // Focus stays in the search field, so Enter keeps stepping through matches.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !editor.setHighlights) return;

    if (!showFindDialog || searchResults.length === 0 || !activeChapter) {
      editor.clearHighlights();
      return;
    }

    const inChapter = searchResults.filter(result => result.chapterId === activeChapter.id);
    const current = searchResults[currentSearchIndex];
    editor.setHighlights(inChapter, inChapter.indexOf(current));

    if (current && current.chapterId === activeChapter.id) {
      // The popover stands over the pane's upper right (V 6.5: not over what the author acts on): when it
      // lies over the text column, the hit goes 16px under its lower edge instead of the pane's middle
      const pop = document.querySelector('.faust-popover--find');
      const pane = editor.getBoundingClientRect();
      const column = editor.querySelector('.cm-content');
      const popRect = pop && pop.getBoundingClientRect();
      const colRect = column && column.getBoundingClientRect();
      const overText = popRect && colRect && popRect.left < colRect.right - 1 && popRect.right > colRect.left + 1 && popRect.bottom > pane.top;
      const clearance = overText ? popRect.bottom - pane.top + 16 : 0;
      editor.scrollToPos(current.start, clearance > 0 && clearance + 64 < pane.height ? clearance : undefined);
    }
  }, [searchResults, currentSearchIndex, activeChapterId, showFindDialog]);

  // The dock floats over the page's last lines (V 6.5): when the voice bar or the voice comparison appears
  // for a selection that lies under it, the text scrolls up until the selection ends 16px above the
  // occupant (the 30vh of free scroll under the last line leaves room). The selection's start stays in view.
  useEffect(() => {
    if (!((voiceInputAvailable && textSelection) || voiceDiffView)) return undefined;
    const frame = requestAnimationFrame(() => {
      const scroller = editorRef.current;
      const view = scroller && scroller.faustView;
      const page = scroller && scroller.closest('.faust-page');
      const occupant = page && page.querySelector(':scope > .faust-dock > *');
      if (!view || !occupant) return;
      const range = view.state.selection.main;
      const end = view.coordsAtPos(range.to);
      const start = view.coordsAtPos(range.from);
      if (!end || !start) return;
      // The occupant's resting top (it rises 6px as it appears): the dock's bottom less its height
      const restingTop = occupant.parentElement.getBoundingClientRect().bottom - occupant.offsetHeight;
      const overlap = end.bottom - (restingTop - 16);
      if (overlap <= 0) return;
      const room = start.top - scroller.getBoundingClientRect().top - 8;
      const step = Math.min(overlap, Math.max(0, room));
      if (step > 0) scroller.scrollTop += step;
    });
    return () => cancelAnimationFrame(frame);
  }, [textSelection, voiceDiffView, voiceInputAvailable]);

  // Editing while results are shown moves the text under them: search again
  useEffect(() => {
    if (!showFindDialog || !lastSearchRef.current || searchResults.length === 0) return;

    const timer = setTimeout(() => {
      const results = collectSearchResults(lastSearchRef.current);
      setSearchResults(results);
      setCurrentSearchIndex(index => (
        results.length === 0 ? -1 : Math.min(Math.max(index, 0), results.length - 1)
      ));
    }, 300);
    return () => clearTimeout(timer);
  }, [activeChapter?.content]);

  // Chapters as the export dialog lists them
  const exportableChapters = project.structure
    .filter(chapter => (chapter.content || '').trim())
    .map(chapter => ({ id: chapter.id, title: chapter.title || 'Nimetön luku', words: countWords(chapter.content) }));

  // The bottom dock of the page (R-62) holds one occupant: the voice result card, then the suggestion
  // bar while suggestions are pending, then the voice bar, then the suggestion bar's other states.
  const dockSuggestionsFirst = !!suggestionInfo && suggestionInfo.pending > 0;
  // Miksi? (I-06): one sentence on why Kielenhuolto made the current change. Only with AI on and in a
  // chapter that may be sent (it sends the line); without the prop the bar shows no Miksi? at all
  const explainSuggestion = (current) => {
    const line = (current && current.meta && current.meta.line) || {};
    return explainChange({
      original: line.original || current.original,
      revised: line.revised || current.insert,
      before: current.original,
      after: current.insert,
      request: (opts) => getAIClient().request({ role: 'edit', ...opts }),
      deps: textDeps,
      cache: explainCacheRef.current
    });
  };
  const explainAllowed = !aiDisabled && !!activeChapter && !isChapterBlocked(project, activeChapter.id);
  const dockSuggestionBar = e(SuggestionBar, {
    info: suggestionInfo,
    controller: suggestionsRef.current,
    onOpenChapter: setActiveChapterId,
    focusEditor: () => editorRef.current && editorRef.current.focus(),
    explain: explainAllowed ? explainSuggestion : undefined
  });

  return e('div', {
    className: (focusMode ? 'faust-app faust-focus-mode' : 'faust-app') + (isFullScreen ? ' is-fullscreen' : ''),
    // Widths of the open side panels, for everything that centres on the editor pane
    // (notifications, popovers, chat window); 0px for a closed panel
    style: {
      '--left-col-w': sidebarCollapsed ? '0px' : 'var(--sidebar-w)',
      '--right-col-w': rightNow.engine || rightNow.language ? 'var(--aipanel-w)' : rightNow.inspector ? 'var(--inspector-w)' : '0px'
    }
  },
    // Dialogs that can appear over anything else
    e(TextPromptDialog, {
      request: textPrompt,
      onDone: (value) => {
        const request = textPrompt;
        setTextPrompt(null);
        if (request) request.resolve(value);
      }
    }),
    e(ConfirmDialog, {
      request: confirmRequest,
      onDone: (confirmed) => {
        const request = confirmRequest;
        setConfirmRequest(null);
        if (request) request.resolve(confirmed);
      }
    }),
    e(CollectionDialog, {
      open: showCollectionDialog,
      onCancel: () => setShowCollectionDialog(false),
      onCreate: (n, t, f) => { createCollection(n, t, f); setShowCollectionDialog(false); }
    }),
    e(ShortcutsDialog, { open: showShortcuts, onClose: () => setShowShortcuts(false), aiDisabled }),
    e(ExportDialog, {
      open: showExportModal,
      onClose: () => setShowExportModal(false),
      chapters: exportableChapters,
      skipped: project.structure.length - exportableChapters.length,
      activeChapterId: activeChapter ? activeChapter.id : null,
      onExport: ({ format, chapterIds }) => window.electronAPI.exportManuscript({ project, format, chapterIds })
    }),
    // Tuonnin esikatselu (stage I-01): Tiedosto ▸ Tuo tekstiä… and Tuo kansio…
    e(ErrorBoundary, { label: 'Tuonnin esikatselu', onDismiss: () => { setImportSource(null); setImportPickError(null); } },
      e(ImportPreviewDialog, {
        source: importSource,
        project,
        getReplaceBlockedReason: () => replaceBlockedReason({ pendingSuggestions: suggestionsRef.current.pendingTotal(), activeRequests: getAIClient().activeCount() }),
        onPickFolder: (request) => beginImport('folder', request, { inPreview: true }),
        onDone: finishImport,
        pickError: importPickError
      })
    ),
    // Liitä muokkauksina (stage I-04): Muokkaa ▸ Liitä muokkauksina… ⌥⌘V
    e(ErrorBoundary, { label: 'Liitä muokkauksina', onDismiss: () => { setPasteEditsRequest(null); suggestionsRef.current.confirmPaste(null); } },
      e(PasteEditsDialog, {
        request: pasteEditsRequest,
        onDone: (choice) => {
          // The dialog closes first and gives the focus back to the manuscript; only then is the compared
          // range released or proposed. A range released while the manuscript has no focus redraws its line
          // under the browser's selection, and the returning focus took the caret from there (the author's
          // selection jumped to the end of the paragraph after Peruuta or Esc).
          ReactDOM.flushSync(() => setPasteEditsRequest(null));
          const result = suggestionsRef.current.confirmPaste(choice);
          // The compared text changed while the dialog was open (a menu command reaches the editor): nothing was proposed
          if (result && result.error === 'target-changed') notify('warning', OLD_PATH_CHANGED);
        }
      })
    ),
    // Oma tarkistus (stage I-08): opened from the Tarkistus tab's picker; the result goes into review.customChecks
    e(ErrorBoundary, { label: 'Oma tarkistus', onDismiss: () => setReviewCheckRequest(null) },
      e(ReviewCheckDialog, {
        request: reviewCheckRequest,
        existing: reviewCustomChecks,
        askConfirm,
        onDone: (result) => {
          const request = reviewCheckRequest;
          setReviewCheckRequest(null);
          saveCustomCheck(result, request, reviewRef.current);
        }
      })
    ),
    // Focus mode: the header is hidden, so a strip at the top keeps the window draggable
    focusMode && e('div', { className: 'faust-focus-drag' }),
    focusMode && e('button', {
      className: 'faust-btn faust-btn--quiet faust-focus-exit' + (focusExitIdle ? ' is-idle' : ''),
      onClick: toggleFocusMode,
      title: 'Poistu keskittymistilasta (' + shortcut('CmdOrCtrl+Shift+F') + ' tai Esc)'
    }, 'Poistu keskittymistilasta'),

    // Header
    e('div', { className: 'faust-header' },
      e('div', { className: 'faust-header__row' },
        // Brand: wordmark, project title and the unsaved dot (always mounted, so the row never changes width)
        e('div', { className: 'faust-header__brand' },
          e('span', { className: 'faust-wordmark' }, 'FAUST', icons.star8({ size: 16 })),
          e('span', { className: 'faust-header__title', title: project.title || 'Nimetön projekti' }, project.title || 'Nimetön projekti'),
          e('span', {
            className: 'faust-header__dot' + (unsavedChanges ? ' is-unsaved' : ''),
            role: 'img',
            'aria-label': unsavedChanges ? 'Projektissa on tallentamattomia muutoksia' : 'Kaikki muutokset on tallennettu',
            title: unsavedChanges ? 'Projektissa on tallentamattomia muutoksia' : 'Kaikki muutokset on tallennettu'
          })
        ),
        // The spacer is always a drag handle for the window
        e('div', { className: 'faust-header__spacer' }),
        // Actions in four groups: Projekti, Näkymät, Paneelit, Teema
        e('div', { className: 'faust-header__actions' },
          // Projekti: Avaa…, recent projects, Tallenna, Tilannekuvat
          e('div', { className: 'faust-header__group' },
            // Avaa… and its recent-projects button are one split control (M C.2 row 5: joined, shared edge)
            e('span', { className: 'faust-header__split' },
              e('button', {
                className: 'faust-btn faust-btn--quiet',
                'data-priority': '1',
                onClick: loadProject,
                title: 'Avaa projekti (' + shortcut('CmdOrCtrl+O') + ')'
              }, 'Avaa…'),

              // Recent projects: always rendered; the menu is a popover in the layer host (R-60, MV-46)
              e('button', {
                ...recentPop.triggerProps,
                className: 'faust-btn faust-btn--icon',
                'data-priority': '1',
                'aria-label': 'Viimeisimmät projektit',
                title: 'Viimeisimmät projektit',
                'aria-haspopup': 'menu'
              }, icons.chevronDown({ size: 14 }))
            ),
            showRecentFilesMenu && e(Popover, { ...recentPop.popoverProps, layer: 'header', menu: true, label: 'Viimeisimmät projektit' },
              recentFiles.length === 0
                ? e('button', { className: 'faust-menu__item', role: 'menuitem', disabled: true }, 'Ei viimeisimpiä projekteja')
                : [
                    ...(() => {
                      // Two files with one name are told apart by their folder, on a second line;
                      // the open project carries the check in the leading slot (V 4.9 'item checked')
                      const parts = (path) => String(path || '').split(/[\\/]/);
                      const baseOf = (path) => parts(path).pop();
                      const folderOf = (path) => parts(path).slice(-2, -1)[0] || '';
                      const seen = {};
                      recentFiles.forEach(file => { const b = baseOf(file.path); seen[b] = (seen[b] || 0) + 1; });
                      return recentFiles.map(file => {
                        const isOpen = !!currentFilePath && file.path === currentFilePath;
                        return e('button', {
                          key: file.path,
                          className: 'faust-menu__item faust-menu__item--author',
                          role: 'menuitemcheckbox',
                          'aria-checked': isOpen,
                          title: file.path,
                          onClick: () => {
                            loadRecentFile(file.path);
                            setShowRecentFilesMenu(false);
                          }
                        },
                          isOpen ? icons.check({ size: 14 }) : e('span', { className: 'faust-menu__slot', 'aria-hidden': true }),
                          e('span', { className: 'faust-menu__text' },
                            e('span', null, baseOf(file.path)),
                            seen[baseOf(file.path)] > 1 ? e('span', { className: 'faust-meta' }, folderOf(file.path)) : null
                          )
                        );
                      });
                    })(),
                    e('div', { key: 'sep', className: 'faust-menu__sep', role: 'separator' }),
                    e('button', {
                      key: 'clear',
                      className: 'faust-menu__item',
                      role: 'menuitem',
                      title: 'Poista projektit vain tästä valikosta. Tiedostot säilyvät.',
                      onClick: () => {
                        setRecentFiles([]);
                        localStorage.removeItem('faust-recent-files');
                        setShowRecentFilesMenu(false);
                      }
                    },
                      // the empty leading slot of the file items, so every label starts on one edge (V 4.9)
                      e('span', { className: 'faust-menu__slot', 'aria-hidden': true }),
                      'Tyhjennä valikko')
                  ]
            ),

            e('button', {
              className: 'faust-btn faust-btn--quiet',
              'data-priority': '1',
              onClick: saveProject,
              title: unsavedChanges
                ? 'Tallenna muutokset (' + shortcut('CmdOrCtrl+S') + ')'
                : 'Tallenna (' + shortcut('CmdOrCtrl+S') + '). Kaikki muutokset on jo tallennettu.'
            }, 'Tallenna'),

            // Tilannekuvat: the button and its popover in the layer host (R-60, MV-44, MV-45)
            e('button', {
              ref: snapshotsPop.anchorRef,
              className: 'faust-btn faust-btn--quiet',
              'data-priority': '2',
              'aria-label': 'Tilannekuvat',
              'aria-pressed': showSnapshotsPanel,
              'aria-expanded': showSnapshotsPanel,
              title: showSnapshotsPanel
                ? 'Kätke tilannekuvat'
                : `Näytä tilannekuvat (${(project.snapshots || []).length}): tallenna koko käsikirjoituksen nykyinen tila nimellä ja palaa siihen myöhemmin. Tilannekuvat tallentuvat projektitiedostoon; ne eivät ole erillinen varmuuskopio.`,
              onClick: () => setShowSnapshotsPanel(prev => !prev)
            }, icons.snapshot({ size: 14 }), e('span', { className: 'faust-btn__label' }, 'Tilannekuvat')),

            // Snapshots dropdown panel. It stays open under the questions it asks (closeUnlessAsking).
            showSnapshotsPanel && e(Popover, {
              ...snapshotsPop.popoverProps,
              onClose: closeUnlessAsking(snapshotsPop.close),
              layer: 'header',
              // 360 px: a snapshot card keeps Poista · Vertaa sanamäärää · Palauta… on one row (V 4.9 per-popover width)
              width: 360,
              title: `Tilannekuvat (${(project.snapshots || []).length})`,
              closeLabel: 'Kätke tilannekuvat',
              closeTitle: 'Kätke tilannekuvat'
            },
              e('div', { className: 'faust-popover__list' },
                // A cancel on either prompt creates nothing
                e('button', {
                  className: 'faust-btn faust-btn--block faust-btn--sm faust-popover__add',
                  title: 'Tallenna koko käsikirjoituksen nykyinen tila tilannekuvaksi, johon voit palata myöhemmin',
                  onClick: async () => {
                    const name = await askText('Tilannekuvan nimi', `Ennen muokkausta ${new Date().toLocaleDateString('fi-FI')}`, '', 'Jatka');
                    if (name === null) return;
                    const desc = await askText('Kuvaus (valinnainen)', '', '', 'Tallenna tilannekuva');
                    if (desc === null) return;
                    createSnapshot(name, desc);
                  }
                }, '+ Uusi tilannekuva…'),

                (project.snapshots || []).length === 0
                  ? e('div', { className: 'faust-empty faust-empty--compact' },
                      e('div', { className: 'faust-empty__title' }, 'Ei vielä tilannekuvia.'),
                      e('div', { className: 'faust-empty__hint' }, 'Tallenna tilannekuva ennen isoja muutoksia, niin voit palata käsikirjoituksen nykyiseen tilaan.')
                    )
                  : [...(project.snapshots || [])].reverse().map(snapshot =>
                      e('div', { key: snapshot.id, className: 'faust-card faust-card--compact' },
                        e('div', { className: 'faust-serif' }, snapshot.name),
                        e('div', { className: 'faust-meta' }, formatDateTimeFi(snapshot.created)),
                        e('div', { className: 'faust-meta' },
                          count(snapshot.chapterCount || 0, 'luku') + ' · ' + count(snapshot.totalWords || 0, 'sana')),
                        snapshot.description && e('div', { className: 'faust-card__body' }, snapshot.description),
                        // One button family; the delete stands apart at the left end (V 4.8)
                        e('div', { style: { display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)' } },
                          e('button', {
                            className: 'faust-btn faust-btn--sm faust-btn--danger',
                            style: { marginRight: 'auto' },
                            title: 'Poista tämä tilannekuva',
                            onClick: async () => {
                              const confirmed = await askConfirm(
                                'Poistetaanko tilannekuva?',
                                'Tilannekuva ”' + snapshot.name + '” poistetaan. Poistoa ei voi kumota.',
                                'Poista tilannekuva',
                                'Peruuta',
                                { danger: true }
                              );
                              if (confirmed) deleteSnapshot(snapshot.id);
                            }
                          }, 'Poista'),
                          e('button', {
                            className: 'faust-btn faust-btn--sm',
                            title: 'Näytä, montako sanaa avoimessa luvussa on nyt ja montako tässä tilannekuvassa',
                            onClick: () => compareWithSnapshot(snapshot.id)
                          }, 'Vertaa sanamäärää'),
                          e('button', {
                            className: 'faust-btn faust-btn--sm',
                            title: 'Palauta kaikki luvut tähän tilannekuvaan',
                            onClick: () => restoreSnapshot(snapshot.id)
                          }, 'Palauta…')
                        )
                      )
                    )
              )
            )
          ),

          // Näkymät: icon-only toggles; each is lit only while its view is really visible
          e('div', { className: 'faust-header__group' },
            e('button', {
              className: 'faust-btn faust-btn--icon',
              'data-priority': '1',
              'aria-label': 'Korttinäkymä',
              'aria-pressed': corkboardEnabled,
              title: corkboardEnabled
                ? 'Kätke korttinäkymä ja palaa tekstiin'
                : 'Näytä korttinäkymä: luvut kortteina, joita voi järjestää vetämällä',
              onClick: () => setCorkboardEnabled(prev => !prev)
            }, icons.cards({ size: 16 })),
            e('button', {
              className: 'faust-btn faust-btn--icon',
              'data-priority': '1',
              'aria-label': 'Jaettu näkymä',
              'aria-pressed': splitViewEnabled && !corkboardEnabled,
              title: corkboardEnabled
                ? 'Palaa tekstiin ja avaa jaettu näkymä'
                : splitViewEnabled
                  ? 'Sulje jaettu näkymä'
                  : 'Avaa jaettu näkymä: toinen luku, hahmo, paikka tai lukujen tiivistelmät tekstin rinnalle',
              onClick: () => toggleSplitView()
            }, icons.split({ size: 16 }))
          ),

          // Paneelit: Sivupalkki, Tietopaneeli, Liminal Engine and Keskustelu
          e('div', { className: 'faust-header__group' },
            e('button', {
              className: 'faust-btn faust-btn--icon',
              'data-priority': '1',
              'aria-label': 'Sivupalkki',
              'aria-pressed': !sidebarCollapsed,
              title: sidebarCollapsed
                ? 'Näytä sivupalkki (' + shortcut('CmdOrCtrl+1') + ')'
                : 'Kätke sivupalkki (' + shortcut('CmdOrCtrl+1') + ')',
              onClick: () => setSidebarCollapsed(prev => !prev)
            }, icons.panelLeft({ size: 16 })),
            e('button', {
              className: 'faust-btn faust-btn--icon',
              'data-priority': '1',
              'aria-label': 'Tietopaneeli',
              'aria-pressed': showInspector,
              title: showInspector
                ? 'Kätke tietopaneeli (' + shortcut('CmdOrCtrl+2') + ')'
                : 'Näytä tietopaneeli: tekstin ulkoasu, luvun ja projektin tiedot, tekoälyasetukset ja tarkistukset (' + shortcut('CmdOrCtrl+2') + ')',
              onClick: () => (showInspector ? setShowInspector(false) : showInspectorTab())
            }, icons.panelRight({ size: 16 })),
            !aiDisabled && e('button', {
              className: 'faust-btn faust-btn--quiet',
              'data-priority': '1',
              'aria-pressed': aiAssistantOpen,
              title: aiAssistantOpen
                ? 'Kätke Liminal Engine (' + shortcut('CmdOrCtrl+Shift+K') + ')'
                : 'Näytä Liminal Engine, FAUSTin tekoälyavustaja: kysy neuvoa tai pyydä muutoksia valittuun tekstiin (' + shortcut('CmdOrCtrl+Shift+K') + ')',
              onClick: () => (aiAssistantOpen ? setAiAssistantOpen(false) : openLiminalEngine())
            }, icons.star8({ size: 14 }), 'Liminal Engine'),
            // Below 1120 px this button moves into the "more" menu (priority 3)
            !aiDisabled && e('button', {
              className: 'faust-btn faust-btn--quiet',
              'data-priority': '3',
              'aria-pressed': claudeChatOpen,
              title: claudeChatOpen
                ? 'Sulje keskustelu'
                : 'Avaa erillinen keskustelu: vastaus näkyy sitä mukaa kuin tekoäly kirjoittaa sitä, ja vastauksen voi lisätä luvun loppuun',
              onClick: () => (claudeChatOpen ? setClaudeChatOpen(false) : openChat())
            }, icons.comment({ size: 14 }), 'Keskustelu')
          ),

          // Teema: two options, the one in use is selected
          e('div', { className: 'faust-header__group' },
            e('div', { className: 'faust-segmented', role: 'radiogroup', 'aria-label': 'Teema', 'data-priority': '1' },
              e('button', {
                className: 'faust-segmented__option',
                role: 'radio',
                'aria-checked': isDarkMode,
                title: 'Ota käyttöön tumma NOX-teema (' + shortcut('CmdOrCtrl+Shift+D') + ' vaihtaa teemaa)',
                onClick: () => setIsDarkMode(true)
              }, 'NOX'),
              e('button', {
                className: 'faust-segmented__option',
                role: 'radio',
                'aria-checked': !isDarkMode,
                title: 'Ota käyttöön vaalea DEIS-teema (' + shortcut('CmdOrCtrl+Shift+D') + ' vaihtaa teemaa)',
                onClick: () => setIsDarkMode(false)
              }, 'DEIS')
            )
          ),

          // "More": shown below 1120 px by the stylesheet; its menu lists the priority-3 commands.
          // Its one row is Keskustelu, so with "Tekoäly pois" the button goes too
          !aiDisabled && e('button', {
            ...headerMore.triggerProps,
            className: 'faust-btn faust-btn--icon faust-header__more',
            'aria-label': 'Lisää toimintoja',
            title: 'Lisää toimintoja',
            'aria-haspopup': 'menu'
          }, icons.more({ size: 16 })),
          headerMore.open && e(Popover, { ...headerMore.popoverProps, layer: 'header', menu: true, label: 'Lisää toimintoja' },
            !aiDisabled && e('button', {
              type: 'button',
              className: 'faust-menu__item',
              role: 'menuitemcheckbox',
              'aria-checked': claudeChatOpen,
              title: claudeChatOpen
                ? 'Sulje keskustelu'
                : 'Avaa erillinen keskustelu: vastaus näkyy sitä mukaa kuin tekoäly kirjoittaa sitä, ja vastauksen voi lisätä luvun loppuun',
              onClick: () => {
                headerMore.close();
                if (claudeChatOpen) setClaudeChatOpen(false); else openChat();
              }
            }, icons.comment({ size: 14 }), 'Keskustelu')
          )
        )
      )
    ),

    // Main content - three columns
    e('div', { className: 'faust-main' },
      // Left sidebar - Chapter list
      // Two states and no strip: closed is width 0 (the shell's 300 ms motion). The header's Sivupalkki
      // button and ⌘1 show it again; the inner panel keeps var(--sidebar-w) while the shell moves.
      e('div', { className: 'faust-sidebar', 'data-state': sidebarCollapsed ? 'closed' : 'open' },
        e('div', { className: 'faust-panel' },
          // Head: the manuscript's word count and goal; the project title is shown in the header only.
          // The row wraps: a long readout pushes the close button to the next line instead of under it.
          (() => {
            const target = Number(project.targets && project.targets.totalWords) || 0;
            const [wordNum, wordNoun] = countParts(totalWords, 'sana');
            // The bar's fill is the exact share (0,4 % of a goal still shows, as a sliver: .faust-progress--goal)
            const percent = target > 0 ? Math.min(100, (totalWords / target) * 100) : 0;
            return e('div', { className: 'faust-panel__head', style: { flexWrap: 'wrap', rowGap: 'var(--sp-1)', paddingTop: 'var(--sp-2)', paddingBottom: 'var(--sp-2)' } },
              target > 0
                ? e('button', {
                    className: 'faust-btn faust-btn--quiet',
                    style: { marginLeft: 'calc(-1 * var(--sp-3))' },
                    title: 'Käsikirjoituksen tavoite. Muuta tavoitetta projektin asetuksissa.',
                    onClick: () => setShowProjectSettings(true)
                  },
                    e('span', { className: 'faust-stat faust-stat--hero' },
                      e('b', null, totalWords.toLocaleString('fi-FI')),
                      ' / ' + target.toLocaleString('fi-FI') + ' sanaa'
                    )
                  )
                : e('span', { className: 'faust-stat faust-stat--hero' }, e('b', null, wordNum), ' ' + wordNoun),
              e('button', {
                className: 'faust-btn faust-btn--icon faust-btn--sm',
                style: { marginLeft: 'auto' },
                'aria-label': 'Kätke sivupalkki (' + shortcut('CmdOrCtrl+1') + ')',
                title: 'Kätke sivupalkki (' + shortcut('CmdOrCtrl+1') + ')',
                onClick: () => setSidebarCollapsed(true)
              }, icons.panelLeft({ size: 14 })),
              // The goal bar belongs to the readout above it; the chapter count follows (M C.3's order of readouts)
              e('div', { style: { flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } },
                target > 0 && e('div', {
                  className: 'faust-progress faust-progress--goal' + (totalWords >= target ? ' is-complete' : '') + (totalWords > 0 ? '' : ' is-empty'),
                  style: { '--value': percent + '%' },
                  'aria-hidden': true
                }, e('i')),
                e('span', { className: 'faust-meta' }, count(project.structure.length, 'luku'))
              )
            );
          })(),

          // Body: chapters and collections (the only part that scrolls)
          e('div', { className: 'faust-panel__body' },
            e('div', { className: 'faust-section' },
              e('div', { className: 'faust-section__head' },
                e('div', { className: 'faust-section__title' }, 'Luvut')
              ),
              project.structure.map((chapter, idx) => {
                const isOpen = chapter.id === activeChapterId;
                return e('div', {
                  key: chapter.id,
                  className: 'faust-row faust-row--two faust-row--author' + (isOpen ? ' is-selected' : ''),
                  role: 'button',
                  tabIndex: 0,
                  'aria-current': isOpen,
                  onClick: () => setActiveChapterId(chapter.id),
                  onKeyDown: (ev) => {
                    if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) {
                      ev.preventDefault();
                      setActiveChapterId(chapter.id);
                    }
                  }
                },
                  e('span', { className: 'faust-row__text' },
                    e('span', { className: 'faust-row__title' }, chapter.title || 'Nimetön luku'),
                    // ' · ei tekoälylle' never loses its end to the ellipsis: the meta may wrap, and only before the suffix
                    chapter.noAI
                      ? e('span', { className: 'faust-row__meta', style: { whiteSpace: 'normal' } },
                          count(chapter.wordCount || 0, 'sana') + ' ', e('span', { style: { whiteSpace: 'nowrap' } }, '· ei tekoälylle'))
                      : e('span', { className: 'faust-row__meta' }, count(chapter.wordCount || 0, 'sana'))
                  ),
                  // Row actions: shown on hover, focus and for the open chapter by the stylesheet
                  e('span', { className: 'faust-row__actions' },
                    e('button', {
                      className: 'faust-btn faust-btn--icon faust-btn--sm',
                      'aria-label': 'Siirrä lukua ylemmäs',
                      // A disabled control's tooltip gives the reason (M B.8)
                      title: idx === 0 ? 'Luku on jo ensimmäinen' : 'Siirrä lukua ylemmäs',
                      disabled: idx === 0,
                      onClick: (ev) => { ev.stopPropagation(); moveChapterUp(chapter.id); }
                    }, icons.arrowUp({ size: 14 })),
                    e('button', {
                      className: 'faust-btn faust-btn--icon faust-btn--sm',
                      'aria-label': 'Siirrä lukua alemmas',
                      title: idx === project.structure.length - 1 ? 'Luku on jo viimeinen' : 'Siirrä lukua alemmas',
                      disabled: idx === project.structure.length - 1,
                      onClick: (ev) => { ev.stopPropagation(); moveChapterDown(chapter.id); }
                    }, icons.arrowDown({ size: 14 })),
                    project.structure.length > 1 && e('button', {
                      className: 'faust-btn faust-btn--icon faust-btn--sm faust-btn--danger',
                      'aria-label': 'Poista luku',
                      title: 'Poista luku',
                      onClick: (ev) => { ev.stopPropagation(); deleteChapter(chapter.id); }
                    }, icons.trash({ size: 14 }))
                  )
                );
              }),
              e('button', {
                className: 'faust-btn faust-btn--block faust-btn--sm',
                style: { marginTop: 'var(--sp-2)' },
                title: 'Lisää uusi luku loppuun (' + shortcut('CmdOrCtrl+Shift+N') + ')',
                onClick: addChapter
              }, '+ Uusi luku')
            ),

            e('div', { className: 'faust-section' },
              e('div', { className: 'faust-section__head' },
                e('div', { className: 'faust-section__title' }, 'Kokoelmat')
              ),
              (project.collections || []).length === 0
                ? e('div', { className: 'faust-empty faust-empty--compact' },
                    e('div', { className: 'faust-empty__title' }, 'Ei vielä kokoelmia.'),
                    e('div', { className: 'faust-empty__hint' }, 'Kokoelma poimii yhteen luvut, joilla on jotain yhteistä, esimerkiksi kaikki luvut, joissa sama hahmo esiintyy.')
                  )
                : (project.collections || []).map(collection => {
                    const chapters = getCollectionChapters(collection);
                    const isActive = activeCollectionId === collection.id;
                    const toggleOpen = () => setActiveCollectionId(isActive ? null : collection.id);
                    // The kind in words (M A.3): the rule and its filter, or the kind's name when the filter is empty
                    const kind = collection.type === 'status'
                      ? (collection.filter ? 'Tila: ' + labelOf('status', normStatus(collection.filter)).toLowerCase() : 'Luvut tilan mukaan')
                      : collection.type === 'character'
                        ? (collection.filter ? 'Hahmo: ' + collection.filter : 'Luvut, joissa esiintyy hahmo')
                        : collection.type === 'search'
                          ? (collection.filter ? 'Hakusana: ' + collection.filter : 'Luvut, joissa on hakusana')
                          : 'Itse valitut luvut';
                    return e('div', { key: collection.id },
                      e('div', {
                        className: 'faust-row faust-row--two faust-row--author faust-row--collection',
                        role: 'button',
                        tabIndex: 0,
                        'aria-expanded': isActive,
                        onClick: toggleOpen,
                        onKeyDown: (ev) => {
                          if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) {
                            ev.preventDefault();
                            toggleOpen();
                          }
                        }
                      },
                        e('span', { className: 'faust-row__icon' },
                          isActive ? icons.chevronDown({ size: 12 }) : icons.chevronRight({ size: 12 })
                        ),
                        e('span', { className: 'faust-row__text' },
                          e('span', { className: 'faust-row__title' }, collection.name),
                          e('span', { className: 'faust-row__meta' }, kind)
                        ),
                        e('span', { className: 'faust-chip faust-chip--count' }, chapters.length),
                        e('span', { className: 'faust-row__actions' },
                          e('button', {
                            className: 'faust-btn faust-btn--icon faust-btn--sm faust-btn--danger',
                            'aria-label': 'Poista kokoelma',
                            title: 'Poista kokoelma',
                            onClick: async (ev) => {
                              ev.stopPropagation();
                              if (await askConfirm('Poistetaanko kokoelma?', 'Kokoelma ”' + collection.name + '” poistetaan. Luvut säilyvät.', 'Poista kokoelma', 'Peruuta', { danger: true })) {
                                deleteCollection(collection.id);
                              }
                            }
                          }, icons.trash({ size: 14 }))
                        )
                      ),
                      // The chapters of an open collection, under its name
                      isActive && e('div', { style: { paddingLeft: 'var(--sp-5)' } },
                        chapters.length === 0
                          ? e('div', { className: 'faust-meta', style: { padding: 'var(--sp-1) var(--sp-3)' } }, 'Ei lukuja')
                          : chapters.map(ch =>
                              e('button', {
                                key: ch.id,
                                className: 'faust-row faust-row--author' + (ch.id === activeChapterId ? ' is-selected' : ''),
                                'aria-current': ch.id === activeChapterId,
                                onClick: () => setActiveChapterId(ch.id)
                              }, e('span', { className: 'faust-row__title' }, ch.title || 'Nimetön luku'))
                            )
                      )
                    );
                  }),
              e('button', {
                className: 'faust-btn faust-btn--block faust-btn--sm',
                style: { marginTop: 'var(--sp-2)' },
                onClick: () => setShowCollectionDialog(true)
              }, '+ Uusi kokoelma…')
            ),

            // Tarinakansio (I-07): the last section of the body; an entry's form is a sheet in the layer host.
            // A new panel for every project, so no draft or open form crosses to the next one
            e(ErrorBoundary, { label: 'Tarinakansio' },
              e(CodexPanel, {
                key: projectEpoch,
                project,
                activeChapterId: activeChapter ? activeChapter.id : null,
                onChange: patchProject,
                confirm: askConfirm,
                focusRequest: codexUi.focus,
                openRequest: { id: codexUi.openId, tick: codexUi.openTick },
                onShowMentions: (ranges) => {
                  if (!editorRef.current) return;
                  // An empty list takes the marks away again, unless Etsi now shows its own hits
                  if (!ranges.length) { if (!showFindDialog) editorRef.current.clearHighlights(); return; }
                  editorRef.current.setHighlights(ranges, 0);
                  editorRef.current.scrollToPos(ranges[0].start);
                },
                mentionsEnabled: true,
                isCurrent: ((epoch) => () => projectEpochRef.current === epoch)(projectEpoch),
                // I-07 review: a typed key marks the project changed at once; a save takes the form's batch;
                // focus mode closes the form; a form closing toward a hidden place gives the focus to the text
                onDirty: () => setUnsavedChanges(true),
                draftsRef: codexDraftsRef,
                focusMode,
                focusEditor: () => { if (editorRef.current) editorRef.current.focus(); }
              }))
          ),

          // Foot: the five tools, always in view
          e('div', { className: 'faust-panel__foot' },
            e('div', { className: 'faust-section__head' },
              e('div', { className: 'faust-section__title' }, 'Työkalut')
            ),
            e('button', {
              className: 'faust-row',
              title: 'Avaa luettelo tarinan hahmoista ja heidän profiileistaan',
              onClick: () => openCharacterList()
            },
              e('span', { className: 'faust-row__icon' }, icons.sol({ size: 14 })),
              e('span', { className: 'faust-row__title' }, 'Hahmot')
            ),
            e('button', {
              className: 'faust-row',
              title: 'Avaa luettelo tarinan tapahtumapaikoista',
              onClick: () => setShowLocationSheet(true)
            },
              e('span', { className: 'faust-row__icon' }, icons.terra({ size: 14 })),
              e('span', { className: 'faust-row__title' }, 'Paikat')
            ),
            e('button', {
              className: 'faust-row',
              title: 'Avaa luettelo juonista, joita seurataan luvusta toiseen',
              onClick: () => setShowThreadSheet(true)
            },
              e('span', { className: 'faust-row__icon' }, icons.lemniscate({ size: 14 })),
              e('span', { className: 'faust-row__title' }, 'Juonilangat')
            ),
            e('button', {
              className: 'faust-row',
              title: 'Avaa aikajana: luvut, tapahtuma-ajat ja juonilangat (' + shortcut('CmdOrCtrl+Shift+T') + ')',
              onClick: () => setShowTimelineView(true)
            },
              e('span', { className: 'faust-row__icon' }, icons.luna({ size: 14 })),
              e('span', { className: 'faust-row__title' }, 'Aikajana')
            ),
            e('button', {
              className: 'faust-row',
              title: 'Avaa tutkimuskansio: muistiinpanot, linkit ja muu taustamateriaali (' + shortcut('CmdOrCtrl+Shift+R') + ')',
              onClick: () => setShowResearchFolder(true)
            },
              e('span', { className: 'faust-row__icon' }, icons.trigon({ size: 14 })),
              e('span', { className: 'faust-row__title' }, 'Tutkimuskansio')
            )
          )
        )
      ),

      // Center editor area (supports split view): a row, filled by the layout file's .faust-editor-area;
      // is-split gives the two panes their equal widths and the one hairline between them (V 4.5)
      e('div', {
        className: 'faust-editor-area' + (splitViewEnabled && !corkboardEnabled ? ' is-split' : '')
      },
        // Corkboard view (when enabled)
        corkboardEnabled ? e('div', {
          className: 'faust-corkboard',
          style: {
            flex: 1,
            padding: 'var(--sp-5)',
            background: 'var(--surface-panel)',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column'
          }
        },
          // Corkboard header: title, hint, and the way back to the text (W11)
          e('div', {
            style: {
              marginBottom: 'var(--sp-5)',
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--sp-4)'
            }
          },
            e('h2', { style: { font: 'var(--type-title-view)' } }, 'Korttinäkymä'),
            e('div', { className: 'faust-meta' },
              count(project.structure.length, 'luku') + ' · Avaa luku klikkaamalla, järjestä vetämällä'),
            e('button', {
              // flush: its label ends on the grid's right edge, as the title starts on its left edge
              className: 'faust-btn faust-btn--quiet faust-btn--flush-end',
              style: { marginLeft: 'auto' },
              title: 'Kätke korttinäkymä ja palaa tekstiin',
              onClick: () => setCorkboardEnabled(false)
            }, 'Kätke korttinäkymä')
          ),

          // Cards grid
          e('div', { className: 'faust-cardgrid' },
            project.structure.map((chapter, idx) =>
              e('div', {
                key: chapter.id,
                className: 'faust-card faust-card--click' +
                  (chapter.id === activeChapterId ? ' is-selected' : '') +
                  (draggedChapterId === chapter.id ? ' is-dragging' : ''),
                role: 'button',
                tabIndex: 0,
                'aria-current': chapter.id === activeChapterId ? 'true' : undefined,
                draggable: true,
                onDragStart: (ev) => {
                  setDraggedChapterId(chapter.id);
                  ev.dataTransfer.effectAllowed = 'move';
                },
                onDragEnd: () => setDraggedChapterId(null),
                onDragOver: (ev) => {
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = 'move';
                  if (draggedChapterId && draggedChapterId !== chapter.id) ev.currentTarget.classList.add('is-drop-target');
                },
                onDragLeave: (ev) => {
                  if (!ev.currentTarget.contains(ev.relatedTarget)) ev.currentTarget.classList.remove('is-drop-target');
                },
                onDrop: (ev) => {
                  ev.preventDefault();
                  ev.currentTarget.classList.remove('is-drop-target');
                  if (draggedChapterId && draggedChapterId !== chapter.id) {
                    // Reorder chapters
                    const fromIdx = project.structure.findIndex(ch => ch.id === draggedChapterId);
                    const toIdx = project.structure.findIndex(ch => ch.id === chapter.id);
                    if (fromIdx !== -1 && toIdx !== -1) {
                      setProject(prev => {
                        const newStructure = [...prev.structure];
                        const [moved] = newStructure.splice(fromIdx, 1);
                        newStructure.splice(toIdx, 0, moved);
                        return { ...prev, structure: newStructure };
                      });
                      setUnsavedChanges(true);
                    }
                  }
                  setDraggedChapterId(null);
                },
                onClick: () => {
                  setActiveChapterId(chapter.id);
                  setCorkboardEnabled(false);
                },
                onKeyDown: (ev) => {
                  if (ev.target !== ev.currentTarget) return;
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    setActiveChapterId(chapter.id);
                    setCorkboardEnabled(false);
                  }
                }
              },
                // Card head: the title and the chapter's number
                e('div', { className: 'faust-card__head' },
                  e('h3', { className: 'faust-card__title' }, chapter.title || 'Nimetön luku'),
                  e('span', { className: 'faust-meta' }, String(idx + 1))
                ),

                // Synopsis preview, upright and clamped to three lines
                (chapter.synopsis || chapter.synopsisAI || chapter.content)
                  ? e('p', { className: 'faust-card__body faust-clamp-3' },
                      chapter.synopsis || chapter.synopsisAI ||
                        (chapter.content.length > 100 ? chapter.content.substring(0, 100) + '…' : chapter.content))
                  : e('p', { className: 'faust-meta' }, 'Ei tiivistelmää'),      // an inline row (M B.16): the body shows the tiivistelmä

                // Card foot: status, words, score
                e('div', { className: 'faust-card__foot' },
                  e('span', { className: 'faust-chip ' + (STATUS_CHIP[normStatus(chapter.status)] || '') },
                    labelOf('status', normStatus(chapter.status))),
                  e('span', { className: 'faust-stat' },
                    e('b', null, countParts(chapter.wordCount || 0, 'sana')[0]), ' ', countParts(chapter.wordCount || 0, 'sana')[1]),
                  chapter.aiQuality && chapter.aiQuality.score > 0 ? e('span', {
                    className: 'faust-stat',
                    title: 'Tekoälyn arvio luvun laadusta asteikolla 1–10'
                  }, 'Laatuarvio ', e('span', null, e('b', null, formatScore(chapter.aiQuality.score)), '/10')) : null
                )
              )
            ),

            // Add chapter card
            e('button', {
              className: 'faust-card faust-card--add faust-ui',
              title: 'Lisää uusi luku loppuun (' + shortcut('CmdOrCtrl+Shift+N') + ')',
              onClick: () => addChapter()
            }, '+ Uusi luku')
          )
        ) :

        // Primary editor pane (normal view)
        e('div', { className: 'faust-editor' },
        // Format bar (V 4.5, MV-61): one row at the top of the pane that never wraps. The groups with
        // data-priority leave by the bar's container rules, priority 2 first, then 3, 4 and 5; the "more" menu
        // lists what the bar hides. The sigil bar (MV-60) is its right end. The buttons call the same
        // functions as the Muotoile and Lisää menus and keep the selection in the text.
        (() => {
          const bookmarkCount = (project.bookmarks || []).length;
          const openFind = () => { setShowFindDialog(true); setShowReplaceDialog(false); };
          // Each item: its face on the bar and, for the groups that can leave, its menu name and keys
          const groups = [
            { id: 'inline', items: [
              { key: 'bold', face: e('b', null, 'B'), title: 'Lihavointi (' + shortcut('CmdOrCtrl+B') + ')', onClick: formatBold, kind: 'glyph' },
              { key: 'italic', face: e('i', null, 'I'), title: 'Kursivointi (' + shortcut('CmdOrCtrl+I') + ')', onClick: formatItalic, kind: 'glyph' },
              { key: 'underline', face: e('u', null, 'U'), title: 'Alleviivaus (' + shortcut('CmdOrCtrl+U') + ')', onClick: formatUnderline, kind: 'glyph' },
              { key: 'strikethrough', face: e('s', null, 'S'), title: 'Yliviivaus (' + shortcut('CmdOrCtrl+Shift+X') + ')', onClick: formatStrikethrough, kind: 'glyph' }
            ] },
            { id: 'paragraph', priority: '2', items: [
              { key: 'heading-1', face: 'Otsikko 1', title: 'Otsikko 1 (' + shortcut('CmdOrCtrl+Alt+1') + ')', onClick: () => formatHeading(1), kind: 'word', menu: 'Otsikko 1', keys: 'CmdOrCtrl+Alt+1' },
              { key: 'heading-2', face: 'Otsikko 2', title: 'Otsikko 2 (' + shortcut('CmdOrCtrl+Alt+2') + ')', onClick: () => formatHeading(2), kind: 'word', menu: 'Otsikko 2', keys: 'CmdOrCtrl+Alt+2' },
              { key: 'heading-3', face: 'Otsikko 3', title: 'Otsikko 3 (' + shortcut('CmdOrCtrl+Alt+3') + ')', onClick: () => formatHeading(3), kind: 'word', menu: 'Otsikko 3', keys: 'CmdOrCtrl+Alt+3' },
              { key: 'body-text', face: 'Leipäteksti', title: 'Leipäteksti (' + shortcut('CmdOrCtrl+Alt+0') + ')', onClick: () => formatHeading(0), kind: 'word', menu: 'Leipäteksti', keys: 'CmdOrCtrl+Alt+0' }
            ] },
            { id: 'blocks', priority: '4', items: [
              { key: 'quote', face: icons.quote({ size: 14 }), name: 'Lainaus', title: 'Lainaus', onClick: formatQuote, kind: 'icon', menu: 'Lainaus' },
              { key: 'list', face: icons.list({ size: 14 }), name: 'Luettelo', title: 'Luettelo (' + shortcut('CmdOrCtrl+Shift+8') + ')', onClick: formatList, kind: 'icon', menu: 'Luettelo', keys: 'CmdOrCtrl+Shift+8' },
              { key: 'numbered-list', face: icons.listOrdered({ size: 14 }), name: 'Numeroitu luettelo', title: 'Numeroitu luettelo (' + shortcut('CmdOrCtrl+Shift+7') + ')', onClick: formatNumberedList, kind: 'icon', menu: 'Numeroitu luettelo', keys: 'CmdOrCtrl+Shift+7' }
            ] },
            { id: 'insert', priority: '3', items: [
              { key: 'scene-break', face: '* * *', name: 'Kohtauksen erotin', title: 'Kohtauksen erotin', onClick: () => insertAtCursor('\n\n* * *\n\n'), kind: 'word', menu: 'Kohtauksen erotin' },
              { key: 'reminder', face: 'Muistutus', title: 'Lisää tekstiin muistutus itselle muodossa [TODO: …]', onClick: insertTodo, kind: 'word', menu: 'Muistutus' }
            ] },
            { id: 'marks', priority: '5', items: [
              { key: 'bookmark-add', face: icons.bookmarkAdd({ size: 14 }), name: 'Lisää kirjanmerkki', title: 'Lisää kirjanmerkki kohdistimen kohdalle', onClick: () => askAndAddBookmark(), kind: 'icon', menu: 'Kirjanmerkki…' },
              {
                key: 'bookmarks',
                face: [icons.bookmark({ size: 14 }), e('span', { key: 'count', className: 'faust-chip faust-chip--count' }, bookmarkCount)],
                name: `Kirjanmerkit (${bookmarkCount})`,
                title: showBookmarksPanel ? 'Kätke kirjanmerkit' : 'Näytä kirjanmerkit',
                onClick: () => setShowBookmarksPanel(prev => !prev),
                pressed: showBookmarksPanel,
                anchor: bookmarksPop.anchorRef,   // the anchor of the bookmarks popover
                kind: 'word',
                menu: `Kirjanmerkit (${bookmarkCount})`,
                // Opening the menu has closed the popover (one at a time): from the menu it only opens
                menuClick: () => setShowBookmarksPanel(true)
              },
              // The anchor of the find popover; pressed while it is open
              { key: 'find', face: icons.search({ size: 14 }), name: 'Etsi', title: 'Etsi (' + shortcut('CmdOrCtrl+F') + ')', onClick: () => (showFindDialog ? closeFindDialog() : openFind()), pressed: showFindDialog, anchor: findPop.anchorRef, kind: 'icon', menu: 'Etsi…', menuClick: openFind, keys: 'CmdOrCtrl+F' }
            ] }
          ];
          const kindClass = { glyph: 'faust-btn--glyph', icon: 'faust-btn--icon', word: 'faust-btn--quiet' };

          // The four AI verbs (MV-60): sigil and caption, the tooltip in M's words and the Latin line
          // (R-55). The first three need 50 characters of text and wait while any of the four runs.
          const tooShort = (activeChapter.content || '').trim().length < 50;
          const toolsOff = tooShort || isGenerating || !!analysisBusy;
          const sigilbar = e('div', { className: 'faust-sigilbar', ref: sigilBarRef, role: 'toolbar', 'aria-label': 'Tekoälyn työkalut tälle luvulle' },
            e(SigilButton, {
              key: 'analyze',
              sigil: 'mercury',
              label: 'Analysoi luku',
              disabled: toolsOff,
              busy: analysisBusy === 'analyze',
              tooltip: tooShort
                ? 'Analysoi luku: kirjoita ensin vähintään 50 merkkiä tekstiä.'
                : 'Analysoi luku: tekoäly lukee koko luvun ja antaa laatuarvion (1–10), parannusehdotukset ja tiivistelmän. Luvun teksti ei muutu.',
              latin: 'Scrutinium profundum',
              onClick: () => runAnalyze()
            }),
            e(SigilButton, {
              key: 'quick',
              sigil: 'alembic',
              label: 'Pika-arvio',
              disabled: toolsOff,
              busy: analysisBusy === 'quick',
              tooltip: tooShort
                ? 'Pika-arvio: kirjoita ensin vähintään 50 merkkiä tekstiä.'
                : 'Pika-arvio: tekoäly lukee luvun alun (noin 2 000 merkkiä) ja antaa laatuarvion (1–10) ja pari parannusehdotusta. Luvun teksti ei muutu.',
              latin: 'Examen celeriter',
              // Its result opens under it, where the tooltip would stand
              tooltipOff: resultPop.open && !!sigilResult && sigilResult.kind === 'quick',
              onClick: () => runQuickCheck()
            }),
            e(SigilButton, {
              key: 'summary',
              sigil: 'sulfur',
              label: 'Tee tiivistelmä',
              disabled: toolsOff,
              busy: analysisBusy === 'summary',
              tooltip: tooShort
                ? 'Tee tiivistelmä: kirjoita ensin vähintään 50 merkkiä tekstiä.'
                : 'Tee tiivistelmä: tekoäly tekee luvusta 2–3 lauseen tiivistelmän, joka näkyy korttinäkymässä ja jaetun näkymän tiivistelmissä. Luvun teksti ei muutu.',
              latin: 'Epitome brevis',
              tooltipOff: resultPop.open && !!sigilResult && sigilResult.kind === 'summary',
              onClick: () => runSummary()
            }),
            // Magnum Opus writes the whole chapter; generateChapter asks first when the chapter has text
            e(SigilButton, {
              key: 'magnum-opus',
              sigil: 'stone',
              label: 'Magnum Opus',
              primary: true,
              // generateChapter returns while an analysis runs, so the stone waits too (V 4.5)
              disabled: !!analysisBusy,
              busy: isGenerating,
              tooltip: isGenerating
                ? 'Magnum Opus on käynnissä: tekoäly kirjoittaa lukua…'
                : 'Magnum Opus – kirjoita luku tekoälyllä: tekoäly kirjoittaa koko luvun ja käyttää pohjana luvun otsikkoa ja aiempia lukuja. Jos luvussa on jo tekstiä, se korvataan; tästä kysytään ensin.',
              latin: isGenerating ? 'Opus in progressu' : undefined,
              onClick: () => generateChapter(activeChapterId)
            })
          );

          // The "more" menu: the commands of the groups the bar hides, read when the menu renders
          const bar = formatBarRef.current;
          const hiddenGroups = formatMore.open && bar
            ? groups.filter(group => {
                const el = group.priority && bar.querySelector(`[data-group="${group.id}"]`);
                return el && el.getClientRects().length === 0;
              })
            : [];

          return e('div', { className: 'faust-formatbar', ref: formatBarRef },
            ...groups.map(group => e('div', {
              key: group.id,
              className: 'faust-formatbar__group',
              'data-group': group.id,
              'data-priority': group.priority
            },
              ...group.items.map(item => e('button', {
                key: item.key,
                ref: item.anchor,
                type: 'button',
                className: 'faust-btn ' + kindClass[item.kind],
                onClick: item.onClick,
                // Pressing a button must not take the selection out of the text
                onMouseDown: (ev) => ev.preventDefault(),
                title: item.title,
                'aria-label': item.kind === 'glyph' ? item.title : item.name,
                'aria-pressed': item.pressed === undefined ? undefined : item.pressed
              }, ...[].concat(item.face)))
            )),
            e('button', {
              ...formatMore.triggerProps,
              key: 'more',
              type: 'button',
              className: 'faust-btn faust-btn--icon faust-formatbar__more',
              onMouseDown: (ev) => ev.preventDefault(),
              'aria-label': 'Lisää toimintoja',
              title: 'Lisää toimintoja',
              'aria-haspopup': 'menu'
            }, icons.more({ size: 14 })),
            // The four AI verbs: not with "Tekoäly pois", in focus mode or in a chapter marked "Ei tekoälylle"
            e('div', { key: 'end', className: 'faust-formatbar__end' }, !aiHidden && !chapterNoAI && sigilbar),
            formatMore.open && e(Popover, { ...formatMore.popoverProps, key: 'more-menu', menu: true, label: 'Lisää toimintoja' },
              ...(() => {
                // The paragraph style of the line with the cursor: the matching item is checked (V 4.9)
                const field = editorRef.current;
                const text = activeChapter.content || '';
                const at = field && typeof field.selectionStart === 'number' ? field.selectionStart : -1;
                const line = at < 0 ? null : text.slice(text.lastIndexOf('\n', at - 1) + 1, (text.indexOf('\n', at) + 1 || text.length + 1) - 1);
                const level = line === null ? null : ((/^(#{1,3})\s/.exec(line) || [])[1] || '').length;
                const checkedKey = level === null ? null : level === 0 ? 'body-text' : 'heading-' + level;
                return hiddenGroups.flatMap((group, index) => [
                  index > 0 ? e('div', { key: 'sep-' + group.id, className: 'faust-menu__sep', role: 'separator' }) : null,
                  group.id === 'paragraph' ? e('div', { key: 'label-' + group.id, className: 'faust-menu__label' }, 'Kappaletyyli') : null,
                  ...group.items.map(item => {
                    const styled = group.id === 'paragraph';
                    return e('button', {
                      key: item.key,
                      type: 'button',
                      className: 'faust-menu__item',
                      role: styled ? 'menuitemradio' : 'menuitem',
                      'aria-checked': styled ? item.key === checkedKey : undefined,
                      onMouseDown: (ev) => ev.preventDefault(),
                      onClick: () => {
                        formatMore.close();
                        (item.menuClick || item.onClick)();
                      }
                    },
                      styled ? (item.key === checkedKey ? icons.check({ size: 14 }) : e('span', { className: 'faust-menu__slot', 'aria-hidden': true })) : null,
                      item.menu,
                      item.keys ? e('span', { className: 'faust-menu__shortcut' }, shortcut(item.keys)) : null
                    );
                  })
                ]).filter(Boolean);
              })()
            ),
            // The result of Pika-arvio or Tee tiivistelmä under its tile (R-61, MV-84): the sigil and a
            // caption, no Latin line. Closed by its button, Esc or a press outside (usePopover).
            resultPop.open && sigilResult && e(Popover, {
              ...resultPop.popoverProps,
              key: 'sigil-result-' + sigilResult.kind,
              anchorRef: { get current() { return sigilTile(sigilResult.kind); } },
              title: sigilResult.kind === 'quick'
                ? e(React.Fragment, null, icons.alembic({ size: 16 }), e('span', { className: 'faust-label' }, 'Pika-arvio'))
                : e(React.Fragment, null, icons.sulfur({ size: 16 }), e('span', { className: 'faust-label' }, 'Tiivistelmä valmis'))
            },
              // The result block (V 4.10) without a head of its own: the popover's head carries it
              sigilResult.kind === 'quick'
                ? e('div', { className: 'faust-result', style: { gap: 'var(--sp-3)', padding: '0 var(--sp-2) var(--sp-2)' } },
                    e('span', { className: 'faust-stat faust-stat--hero' }, 'Laatuarvio ', e('span', null, e('b', null, formatScore(sigilResult.score)), '/10')),
                    sigilResult.suggestions.length > 0 && e('ul', { className: 'faust-ui', style: { margin: 0, paddingLeft: 'var(--sp-5)' } },
                      ...sigilResult.suggestions.map((suggestion, idx) => e('li', { key: idx }, suggestion))
                    )
                  )
                : e('div', { className: 'faust-result', style: { gap: 'var(--sp-3)', padding: '0 var(--sp-2) var(--sp-2)' } },
                    e('p', { className: 'faust-serif', style: { margin: 0, whiteSpace: 'pre-wrap' } }, sigilResult.synopsis),
                    e('div', { className: 'faust-meta' }, 'Se näkyy myös luvun kortissa korttinäkymässä.')
                  )
            )
          );
        })(),

        e('div', { className: 'faust-page', style: { '--ms-size': 18 * (parseInt(editorZoom) / 100) + 'px', '--measure-face': manuscriptFont.face } },
          // The page head: title and meta row in the text's column (--page-edge)
          e('div', { className: 'faust-page__head' },
            // Chapter title
            e('input', {
              className: 'faust-chapter-title',
              value: activeChapter.title,
              onChange: (ev) => {
                setProject(prev => ({
                  ...prev,
                  structure: prev.structure.map(ch =>
                    ch.id === activeChapterId ? { ...ch, title: ev.target.value } : ch
                  )
                }));
                setUnsavedChanges(true);
              },
              placeholder: 'Luvun otsikko'
            }),

            // Word count and AI quality bar
            e('div', { className: 'faust-chapter-meta' },
              // Word count
              e('span', { className: 'faust-stat' },
                e('b', null, countParts(activeChapter.wordCount || 0, 'sana')[0]), ' ', countParts(activeChapter.wordCount || 0, 'sana')[1]),

              // Status chip: opens Tietopaneeli on the Luku tab (W10)
              e('button', {
                className: 'faust-chip ' + (STATUS_CHIP[normStatus(activeChapter.status)] || ''),
                'aria-label': 'Tila: ' + labelOf('status', normStatus(activeChapter.status)).toLowerCase(),
                title: 'Luvun tila. Muuta tilaa tietopaneelin Luku-välilehdellä.',
                onClick: () => showInspectorTab('chapter')
              }, labelOf('status', normStatus(activeChapter.status))),

              // Quality score of the last analysis
              activeChapter.aiQuality && activeChapter.aiQuality.score > 0 ? e('span', {
                className: 'faust-stat',
                title: 'Tekoälyn arvio luvun laadusta asteikolla 1–10'
              }, 'Laatuarvio ', e('span', null, e('b', null, formatScore(activeChapter.aiQuality.score)), '/10')) : null,

              // Tempo: only after a full analysis (Pika-arvio writes neither strengths nor tension)
              activeChapter.aiQuality && activeChapter.aiQuality.lastAnalyzed &&
              ((activeChapter.aiQuality.strengths || []).length > 0 || ((activeChapter.pacing || {}).tension || 0) > 0) &&
              activeChapter.pacing && ['slow', 'medium', 'fast'].includes(activeChapter.pacing.speed) ? e('span', {
                className: 'faust-stat',
                title: 'Tekoälyn arvio kerronnan temposta'
              }, 'Tempo: ', labelOf('tempo', activeChapter.pacing.speed)) : null
            )
          ),

          // Editor wrapper with AnnotationMargin
          e('div', { className: 'faust-page__body' },
            // AnnotationMargin: the marker strip beside the text. It asks before a delete through askConfirm.
            window.AnnotationMargin && e(window.AnnotationMargin, {
              annotations: activeChapter.annotations || [],
              content: activeChapter.content,
              onAnnotationClick: handleAnnotationClick,
              onCreateAnnotation: handleCreateAnnotation,
              onUpdateAnnotation: handleUpdateAnnotation,
              onDeleteAnnotation: handleDeleteAnnotation,
              askConfirm: askConfirm,
              editorDimensions: editorDimensions
            }),

            // Bookmarks (MV-65): a popover anchored to the format bar's bookmarks button (R-60), or to
            // the bar's "more" button while the bar hides it (formatBarAnchor); outside press, Esc and
            // one popover at a time come from usePopover. Rendered in the layer host; it stays open
            // under the question of its Poista (closeUnlessAsking).
            showBookmarksPanel && e(Popover, {
              ...bookmarksPop.popoverProps,
              anchorRef: formatBarAnchor(bookmarksPop.anchorRef),
              onClose: closeUnlessAsking(bookmarksPop.close),
              title: `Kirjanmerkit (${(project.bookmarks || []).length})`,
              closeLabel: 'Kätke kirjanmerkit',
              closeTitle: 'Kätke kirjanmerkit',
              // The width of Tilannekuvat: the two list popovers (title, add action, list) are one kind of thing
              width: 360
            },
              // The add action heads the list, as in Tilannekuvat (B.2 short form)
              e('button', {
                type: 'button',
                className: 'faust-btn faust-btn--block faust-btn--sm faust-popover__add',
                title: 'Lisää kirjanmerkki kohdistimen kohdalle',
                onClick: () => askAndAddBookmark()
              }, '+ Kirjanmerkki…'),
              (project.bookmarks || []).length === 0
                ? e('div', { className: 'faust-empty faust-empty--compact' },
                    e('div', { className: 'faust-empty__title' }, 'Ei vielä kirjanmerkkejä.'),
                    e('div', { className: 'faust-empty__hint' }, 'Kirjanmerkillä palaat nopeasti tiettyyn kohtaan tekstissä.')
                  )
                : (project.bookmarks || []).map(bookmark => {
                    // The chapter line shows the chapter's current title
                    const chapter = (project.structure || []).find(ch => ch.id === bookmark.chapterId);
                    const chapterTitle = (chapter ? chapter.title : bookmark.chapterTitle) || 'Nimetön luku';
                    // A row holds its delete button, so it is a div with role="button", not a button
                    return e('div', {
                      key: bookmark.id,
                      className: 'faust-row faust-row--two faust-row--author',
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => jumpToBookmark(bookmark),
                      onKeyDown: (ev) => {
                        if (ev.target !== ev.currentTarget) return;
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          jumpToBookmark(bookmark);
                        }
                      }
                    },
                      e('div', { className: 'faust-row__text' },
                        e('span', { className: 'faust-row__title' }, bookmark.name),
                        e('span', {
                          className: 'faust-row__meta',
                          style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }
                        }, icons.hexagon({ size: 12 }), 'Luku: ' + chapterTitle),
                        bookmark.context && e('span', { className: 'faust-quote faust-clamp-2' }, `”…${stripMarkers(bookmark.context).trim()}…”`)
                      ),
                      e('div', { className: 'faust-row__actions' },
                        e('button', {
                          type: 'button',
                          className: 'faust-btn faust-btn--sm faust-btn--danger',
                          title: 'Poista kirjanmerkki',
                          onClick: async (ev) => {
                            ev.stopPropagation();
                            const confirmed = await askConfirm(
                              'Poistetaanko kirjanmerkki?',
                              `Kirjanmerkki ”${bookmark.name}” poistetaan. Teksti ei muutu.`,
                              'Poista kirjanmerkki',
                              'Peruuta',
                              { danger: true }
                            );
                            if (confirmed) deleteBookmark(bookmark.id);
                          }
                        }, 'Poista')
                      )
                    );
                  })
            ),

            // Manuscript editor (CodeMirror, see src/components/FaustEditor.js).
            // editorRef gets a textarea-compatible element. Remounted per chapter
            // so every chapter starts with its own cursor and scroll position.
            e(FaustEditor, {
              // A new project always gets a new editor, also when its first chapter has the same id (contracts 4.4)
              key: `${projectEpoch}:${activeChapter.id}`,
              ref: editorRef,
              value: activeChapter.content,
              onChange: (text, meta) => updateChapterContent(text, false, meta),
              ...suggestionsRef.current.editorProps(activeChapter.id),
              // The Pikamuokkaus prompt reports what the author does there to the quick-edit controller
              aiHost: quickEditRef.current.host,
              // Älykäs kirjoitus: ” ’ – while typing, in a Finnish project only (I-06)
              smartTyping: { enabled: smartTypingOn !== false && (project.language || 'fi') === 'fi' },
              // Vältettävät sanat and the Tarinakansio mentions; ⌘-click on a name opens its entry (I-07)
              termHighlights,
              onMentionClick: openCodexEntry,
              // The Tarkistus tab's open findings, only while the tab is on screen; a click selects its card (I-08)
              findingHighlights: reviewRef.current.highlightProps(),
              onFindingClick: (id) => reviewRef.current.onFindingClick(id),
              onMouseUp: handleTextSelection,
              onKeyUp: handleTextSelection,
              typewriterMode: typewriterMode, // the editor keeps the cursor line centered
              placeholder: 'Aloita kirjoittaminen…',
              style: {
                flex: 1,
                fontFamily: manuscriptFont.stack,
                fontSize: 'var(--ms-size)',   // the page element's manuscript size (zoom)
                lineHeight: lineSpacing,
                textAlign: textAlign,
                // Space after every paragraph: 1.0 = none, 1.5 = 0.4 em, 2.0 = 0.8 em
                paragraphGap: `${Math.max(0, (parseFloat(paragraphSpacing) || 1) - 1) * 0.8}em`,
                // Typewriter mode needs room above the first and below the last line
                paddingTop: typewriterMode ? '40vh' : undefined,
                paddingBottom: typewriterMode ? '50vh' : '30vh'
              }
            })
          ),

          // Etsi (MV-64): a popover of 440 px anchored to the format bar's Etsi button (R-60), to the
          // bar's "more" button while the bar hides it (a narrow bar, a split pane), at the fallback
          // place in focus mode (formatBarAnchor). Outside press, Esc and one popover at a time come
          // from usePopover; it stays open under the question of Korvaa kaikki… (closeUnlessAsking).
          // Closing it clears the hits (see closeFindDialog).
          showFindDialog ? e(Popover, {
            ...findPop.popoverProps,
            anchorRef: formatBarAnchor(findPop.anchorRef),
            // At the main pane's right edge, so the hit in the text column stays in view (V 4.9); the
            // hit itself is scrolled clear of the popover (see the effect that marks the matches)
            alignRef: { get current() { return document.querySelector('.faust-editor-area > .faust-editor'); } },
            onClose: closeUnlessAsking(closeFindDialog),
            // Find is a tool of the text: closed, it gives the focus back to the manuscript at its caret,
            // not to the bar's Etsi button (typing goes on in the text)
            restoreFocus: () => { if (editorRef.current) editorRef.current.focus(); },
            className: 'faust-popover--find',
            // 460 px: the option Myös hahmot, paikat ja juonilangat stays on one line in its column
            width: 460,
            title: showReplaceDialog ? 'Etsi ja korvaa' : 'Etsi',
            closeLabel: 'Sulje',
            closeTitle: 'Sulje (Esc)',
            // The foot holds the actions on the text: Etsi alone, or Etsi, Korvaa and Korvaa kaikki… with the
            // replacing one at the right end (B.10). Edellinen and Seuraava stand on the hit line in the body.
            footer: showReplaceDialog
              ? [
                  e('button', {
                    key: 'find',
                    type: 'button',
                    className: 'faust-btn faust-btn--sm',
                    onClick: () => performSearch()
                  }, 'Etsi'),
                  (() => {
                    // A hit in a character, place or thread has no text in the manuscript to replace
                    const current = searchResults[currentSearchIndex];
                    const outsideChapters = !!current && !current.chapterId;
                    return e('button', {
                      key: 'replace',
                      type: 'button',
                      className: 'faust-btn faust-btn--sm',
                      onClick: replaceCurrent,
                      disabled: !current || outsideChapters,
                      title: outsideChapters ? 'Korvaus koskee vain lukujen tekstiä' : (!current ? 'Etsi ensin osumat' : undefined)
                    }, 'Korvaa');
                  })(),
                  e('button', {
                    key: 'replace-all',
                    type: 'button',
                    className: 'faust-btn faust-btn--sm faust-btn--primary',
                    onClick: replaceAll,
                    disabled: searchResults.length === 0,
                    title: searchResults.length === 0 ? 'Etsi ensin osumat' : undefined
                  }, 'Korvaa kaikki…')
                ]
              : e('button', {
                  type: 'button',
                  className: 'faust-btn faust-btn--sm faust-btn--primary',
                  onClick: () => performSearch()
                }, 'Etsi')
          },
            e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
              e('div', { className: 'faust-field' },
                e('input', {
                  id: 'search-term',
                  name: 'searchTerm',
                  type: 'text',
                  className: 'faust-input',
                  value: searchTerm,
                  onChange: (ev) => setSearchTerm(ev.target.value),
                  // Esc reaches the popover, which closes itself (R-70)
                  onKeyDown: (ev) => {
                    if (ev.key === 'Enter') handleSearchEnter(ev.shiftKey);
                  },
                  placeholder: 'Etsittävä teksti',
                  'aria-label': 'Etsittävä teksti',
                  autoFocus: true,
                  'aria-invalid': findPatternError ? true : undefined,
                  'aria-describedby': findPatternError ? 'search-term-error' : undefined
                }),
                // An invalid pattern is the field's error, not a notification
                findPatternError
                  ? e('div', { id: 'search-term-error', className: 'faust-field__error' }, 'Säännöllisessä lausekkeessa on virhe.')
                  : null
              ),
              showReplaceDialog ? e('input', {
                id: 'replace-term',
                name: 'replaceTerm',
                type: 'text',
                className: 'faust-input',
                value: replaceTerm,
                onChange: (ev) => setReplaceTerm(ev.target.value),
                placeholder: 'Korvaava teksti',
                'aria-label': 'Korvaava teksti'
              }) : null,
              // Switch between the two modes inside the panel (W14): a text link under the fields (M C.5 row 27)
              e('div', null,
                e('button', {
                  type: 'button',
                  className: 'faust-link',
                  onClick: () => setShowReplaceDialog(!showReplaceDialog),
                  title: showReplaceDialog ? 'Näytä vain etsintä' : 'Etsi ja korvaa (' + shortcut('CmdOrCtrl+Alt+F') + ')'
                }, showReplaceDialog ? 'Vain etsi' : 'Etsi ja korvaa')
              ),
              // Where to search (row 1) and how to match (row 2), in two shared columns
              e('div', { className: 'faust-check-grid' },
                e('label', { className: 'faust-check' },
                  e('input', {
                    id: 'search-all-chapters',
                    name: 'searchInAllChapters',
                    type: 'checkbox',
                    checked: searchInAllChapters,
                    onChange: (ev) => setSearchInAllChapters(ev.target.checked)
                  }),
                  'Kaikki luvut'
                ),
                e('label', { className: 'faust-check' },
                  e('input', {
                    id: 'search-globally',
                    name: 'searchGlobally',
                    type: 'checkbox',
                    checked: searchGlobally,
                    onChange: (ev) => {
                      setSearchGlobally(ev.target.checked);
                      if (ev.target.checked) {
                        setSearchInAllChapters(true); // Global implies all chapters
                      }
                    }
                  }),
                  'Myös hahmot, paikat ja juonilangat'
                ),
                e('label', { className: 'faust-check', title: 'Isot ja pienet kirjaimet erotetaan toisistaan' },
                  e('input', {
                    id: 'search-case-sensitive',
                    name: 'caseSensitive',
                    type: 'checkbox',
                    checked: caseSensitive,
                    onChange: (ev) => setCaseSensitive(ev.target.checked)
                  }),
                  'Sama kirjainkoko'
                ),
                e('label', { className: 'faust-check' },
                  e('input', {
                    id: 'search-whole-word',
                    name: 'matchWholeWord',
                    type: 'checkbox',
                    checked: matchWholeWord,
                    onChange: (ev) => setMatchWholeWord(ev.target.checked)
                  }),
                  'Koko sana'
                )
              ),
              // The panel remounts each time it opens while useRegex persists: open while the option is ticked
              e('details', { className: 'faust-disclosure', open: useRegex || undefined },
                e('summary', null, icons.chevronRight({ size: 14 }), 'Lisäasetukset'),
                e('label', {
                  className: 'faust-check',
                  title: 'Etsittävä teksti tulkitaan säännöllisenä lausekkeena. Edistyneille käyttäjille.'
                },
                  e('input', {
                    id: 'search-regex',
                    name: 'useRegex',
                    type: 'checkbox',
                    checked: useRegex,
                    onChange: (ev) => setUseRegex(ev.target.checked)
                  }),
                  'Säännöllinen lauseke'
                )
              ),
              // Search history
              searchHistory.length > 0 ? e('details', { className: 'faust-disclosure' },
                e('summary', null, icons.chevronRight({ size: 14 }), `Aiemmat haut (${searchHistory.length})`),
                // The popover body is the one scroller (at most 10 earlier searches are kept)
                ...searchHistory.map((term, idx) =>
                  e('button', {
                    key: idx,
                    type: 'button',
                    className: 'faust-row',
                    onClick: () => {
                      setSearchTerm(term);
                      performSearch(term);
                    }
                  }, e('span', { className: 'faust-row__title' }, term))
                )
              ) : null,
              // Where the search stands: the current hit and its place, or no hits
              (() => {
                if (findPatternError) return null;
                if (searchResults.length === 0) {
                  // Only after a search with the term in the field
                  if (!searchTerm || lastSearchRef.current !== searchTerm) return null;
                  return e('div', { className: 'faust-meta', role: 'status' },
                    searchInAllChapters ? 'Ei osumia' : 'Ei osumia tässä luvussa');
                }
                const result = searchResults[currentSearchIndex];
                const excerpt = result && result.context;
                const place = !result ? null
                  : result.type === 'character' ? [icons.sol({ size: 12 }), 'Hahmo: ' + (result.itemName || 'Nimetön hahmo')]
                  : result.type === 'location' ? [icons.terra({ size: 12 }), 'Paikka: ' + (result.itemName || 'Nimetön paikka')]
                  : result.type === 'thread' ? [icons.lemniscate({ size: 12 }), 'Juonilanka: ' + (result.itemName || 'Nimetön juonilanka')]
                  : [icons.hexagon({ size: 12 }), 'Luku: ' + (result.chapterTitle || 'Nimetön luku')];
                return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } },
                  // The hit line: where the search stands, and the steps through the hits
                  e('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' } },
                    e('span', { className: 'faust-meta', role: 'status', style: { marginRight: 'auto' } },
                      `Osuma ${(currentSearchIndex + 1).toLocaleString('fi-FI')} / ${searchResults.length.toLocaleString('fi-FI')}`),
                    e('button', {
                      type: 'button',
                      className: 'faust-btn faust-btn--sm',
                      onClick: findPrevious,
                      title: 'Etsi edellinen (' + shortcut('CmdOrCtrl+Shift+G') + ')'
                    }, 'Edellinen'),
                    e('button', {
                      type: 'button',
                      className: 'faust-btn faust-btn--sm',
                      onClick: findNext,
                      title: 'Etsi seuraava (' + shortcut('CmdOrCtrl+G') + ')'
                    }, 'Seuraava')
                  ),
                  place ? e('div', {
                    className: 'faust-meta',
                    style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-1)' }
                  }, ...place) : null,
                  excerpt
                    ? e('div', { className: 'faust-quote faust-clamp-2' },
                        '”…' + excerpt.before,
                        e('mark', { className: 'faust-mark--search-current' }, excerpt.hit),
                        excerpt.after + '…”')
                    : null
                );
              })()
            )
          ) : null,

          // The bottom dock (R-62, V 6.5): the page's last child, its one band where a transient surface
          // floats over the paper. One occupant, in the order of the expression at its end.
          (() => {
            // Voice edit bar (appears when text is selected)
            const voiceBarShown = !!(!aiDisabled && !chapterNoAI && voiceInputAvailable && textSelection && !voiceDiffView);
            const voiceBar = voiceBarShown ? e('div', {
              className: 'faust-voicebar',
              'data-state': voiceState === 'listening' ? 'listening' : undefined
            },
              // Pressed while it listens, the button stops listening (V 4.1); what was heard so far is used.
              // The Liminal Engine's dictation shares the one VoiceInput; only the one that started it shows
              // listening (voiceOwnerRef), and the other's button waits until it is done.
              e(VoiceButton, {
                state: voiceState,
                label: voiceState === 'listening' ? 'Kuunnellaan – puhu nyt' : 'Muokkaa valintaa puhumalla',
                // While the Liminal Engine dictates, the shared input is its own: this button waits (B.8 reason)
                title: aiChatVoiceState === 'listening' ? 'Lopeta ensin sanelu Liminal Enginessä' : undefined,
                disabled: voiceState === 'error' || aiChatVoiceState === 'listening',
                onToggle: voiceState === 'listening'
                  ? () => { if (voiceInputRef.current) voiceInputRef.current.stop(); }   // handleVoiceEdit uses what was heard
                  : handleVoiceEdit
              }),
              voiceState === 'listening'
                ? e('span', { className: 'faust-voicebar__state' }, 'Kuunnellaan – puhu nyt')
                : voiceState === 'processing'
                  ? e('span', { className: 'faust-voicebar__state' },
                      e('span', { className: 'faust-spinner faust-spinner--sm' }),
                      'Tekoäly muokkaa tekstiä…'
                    )
                  : e('div', null,
                      e('div', { className: 'faust-voicebar__state' }, 'Muokkaa valintaa puhumalla'),
                      // a sentence to the author: serif (V 0.1 rule 3)
                      e('div', { className: 'faust-voicebar__hint' }, 'Klikkaa mikrofonia ja kerro, miten tekstiä muutetaan')
                    )
            ) : null;

            // Voice comparison (after a voice edit has produced an ehdotus): the floating result block
            const voiceCard = voiceDiffView ? (() => {
              // The column heads and the counts read one count of the words
              const stats = changeStats(voiceDiffView.original || '', voiceDiffView.revised || '');

              return e('div', { className: 'faust-result faust-result--floating' },
                e('div', { className: 'faust-result__head' },
                  e('span', { className: 'faust-label' }, 'Ehdotus'),
                  diffCounts(stats)
                ),
                e('div', { className: 'faust-result__context' }, `Puhuttu ohje: ”${voiceDiffView.instruction}”`),
                // The legend of M C.11 row 28, worded for the two columns of this comparison (R-20)
                e('div', { className: 'faust-meta faust-diff__legend' },
                  e('ins', { className: 'faust-mark faust-mark--ins' }, 'Vihreä'), ': on ehdotuksessa, mutta ei alkuperäisessä tekstissä. ',
                  e('del', { className: 'faust-mark faust-mark--del' }, 'Punainen yliviivattu'), ': on alkuperäisessä tekstissä, mutta ei ehdotuksessa.'),
                // The word comparison in the shared renderer (R-87): the old text with its deletions
                // (del.faust-mark--del), the ehdotus with its insertions (ins.faust-mark--ins)
                e('div', { className: 'faust-result__body' },
                  e(DiffView, {
                    mode: 'split',
                    pieces: computeTextDiff(voiceDiffView.original, voiceDiffView.revised),
                    // The heads as in Versioiden vertailu: the name in the interface face, the count beside it
                    before: e(React.Fragment, null,
                      e('span', { className: 'faust-ui' }, 'Alkuperäinen'),
                      e('span', { className: 'faust-diff__count' }, count(stats.originalWords, 'sana'))),
                    after: e(React.Fragment, null,
                      e('span', { className: 'faust-ui' }, 'Ehdotus'),
                      e('span', { className: 'faust-diff__count' }, count(stats.revisedWords, 'sana')))
                  })
                ),
                e('div', { className: 'faust-result__actions' },
                  e('button', {
                    type: 'button',
                    className: 'faust-btn faust-btn--quiet',
                    onClick: rejectVoiceEdit
                  }, 'Hylkää'),
                  e('button', {
                    type: 'button',
                    className: 'faust-btn faust-btn--primary',
                    onClick: acceptVoiceEdit
                  }, 'Korvaa valittu teksti')
                )
              );
            })() : null;

            return e('div', { className: 'faust-dock' }, voiceDiffView ? voiceCard : dockSuggestionsFirst ? dockSuggestionBar : voiceBarShown ? voiceBar : dockSuggestionBar);
          })()
        )
      ),

        // Split View Secondary Pane (shown when split view is enabled, only in editor mode not corkboard)
        !corkboardEnabled && splitViewEnabled && (() => {
          // One selection per type (BUG-4). Places are stored by name in project.continuity.locations.
          const refChapter = project.structure.find(ch => ch.id === splitViewChapterId) || null;
          const characters = project.characters || [];
          const refCharacter = characters.find(c => c.id === splitViewCharacterId) || null;
          const placeEntries = Object.entries((project.continuity && project.continuity.locations) || {});
          const refPlaceEntry = placeEntries.find(([key]) => key === splitViewLocationId) || null;
          const refPlace = refPlaceEntry ? refPlaceEntry[1] : null;
          // Character fields are read as the Hahmot window reads them: basicInfo first, then the top level.
          const charField = (c, key) => (c.basicInfo && c.basicInfo[key] != null ? c.basicInfo[key] : c[key]);
          const charName = (c) => c.name || (c.basicInfo && c.basicInfo.name) || 'Nimetön hahmo';
          const emptyState = (text) => e('div', { className: 'faust-empty faust-empty--compact' },
            e('p', { className: 'faust-empty__title', style: { margin: 0 } }, text));
          const viewTitle = (text) => e('h2', { style: { margin: '0 0 var(--sp-4)', font: 'var(--type-title-view)' } }, text);
          const section = (title, ...children) => e('div', { className: 'faust-section' },
            e('h3', { className: 'faust-section__title', style: { margin: '0 0 var(--sp-2)' } }, title),
            ...children);
          const authorText = (text) => e('p', { className: 'faust-serif', style: { margin: 0, whiteSpace: 'pre-wrap' } }, text);
          const infoLine = (text) => e('p', { className: 'faust-ui', style: { margin: 0 } }, text);

          // The hairline between the panes is .faust-editor-area.is-split's (V 4.5)
          return e('div', { className: 'faust-editor faust-editor-split' },
            // Split view header with selector: it stays put while the content scrolls. It is as high as the
            // main pane's format bar, so the two rules meet across the divider and the titles share a line.
            e('div', { className: 'faust-split-head' },
              e('label', { className: 'faust-field__label', htmlFor: 'faust-split-type' }, 'Näytä:'),

              // View type selector
              e('select', {
                id: 'faust-split-type',
                className: 'faust-select faust-select--sm',
                value: splitViewType,
                onChange: (ev) => setSplitViewType(ev.target.value),
                'aria-label': 'Valitse, mitä jaetussa näkymässä näytetään',
                style: { flex: 'none', width: 'auto' }
              },
                e('option', { value: 'chapter' }, 'Luku'),
                e('option', { value: 'character' }, 'Hahmo'),
                e('option', { value: 'location' }, 'Paikka'),
                e('option', { value: 'outline' }, 'Tiivistelmät')
              ),

              // Chapter/item selector (depends on type)
              splitViewType === 'chapter' && e('select', {
                className: 'faust-select faust-select--sm',
                value: refChapter ? refChapter.id : '',
                onChange: (ev) => setSplitViewChapterId(ev.target.value),
                'aria-label': 'Valitse luku',
                // a long name ends in an ellipsis in the field; the whole name is in the tooltip
                title: refChapter ? (refChapter.title || 'Nimetön luku') : undefined,
                style: { flex: '1 1 auto', minWidth: 0, maxWidth: '280px' }
              },
                e('option', { value: '', disabled: true }, 'Valitse luku'),
                project.structure.map((ch, idx) =>
                  e('option', { key: ch.id, value: ch.id },
                    `${idx + 1}. ${ch.title || 'Nimetön luku'}${ch.id === activeChapterId ? ' (auki vasemmalla)' : ''}`)
                )
              ),

              splitViewType === 'character' && e('select', {
                className: 'faust-select faust-select--sm',
                value: refCharacter ? refCharacter.id : '',
                onChange: (ev) => setSplitViewCharacterId(ev.target.value),
                disabled: characters.length === 0,
                title: characters.length === 0 ? 'Tarinassa ei ole vielä hahmoja.' : undefined,
                'aria-label': 'Valitse hahmo',
                style: { flex: '1 1 auto', minWidth: 0, maxWidth: '280px' }
              },
                e('option', { value: '', disabled: true }, 'Valitse hahmo'),
                characters.map(c =>
                  e('option', { key: c.id, value: c.id }, charName(c))
                )
              ),

              splitViewType === 'location' && e('select', {
                className: 'faust-select faust-select--sm',
                value: refPlaceEntry ? refPlaceEntry[0] : '',
                onChange: (ev) => setSplitViewLocationId(ev.target.value),
                disabled: placeEntries.length === 0,
                title: placeEntries.length === 0 ? 'Tarinassa ei ole vielä paikkoja.' : undefined,
                'aria-label': 'Valitse paikka',
                style: { flex: '1 1 auto', minWidth: 0, maxWidth: '280px' }
              },
                e('option', { value: '', disabled: true }, 'Valitse paikka'),
                placeEntries.map(([key, loc]) =>
                  e('option', { key, value: key }, (loc && loc.name) || key)
                )
              ),

              // Close button, always at the right end
              e('button', {
                className: 'faust-btn faust-btn--icon',
                onClick: () => setSplitViewEnabled(false),
                title: 'Sulje jaettu näkymä',
                'aria-label': 'Sulje jaettu näkymä',
                style: { marginLeft: 'auto' }
              }, icons.close({ size: 14 }))
            ),

            // Chapter view: a page of its own (V 6.3, R-87). Title and meta line stand in its head, on the
            // text's left edge; the text is a read-only editor, the pane's one scroller, which dims the
            // Markdown markers as the main pane does. No dock: nothing is edited here (R-62).
            splitViewType === 'chapter' && refChapter
              ? e('div', { className: 'faust-page', style: { '--ms-size': 18 * (parseInt(editorZoom) / 100) + 'px', '--measure-face': manuscriptFont.face } },
                  // The same head as the main pane's: the count and the status chip, then 'vain katselu' as a plain
                  // readout (it is not a status, so it is not a chip: one look for one kind of thing, V 0.1 rule 7)
                  e('div', { className: 'faust-page__head' },
                    e('h2', { className: 'faust-chapter-title' }, refChapter.title || 'Nimetön luku'),
                    e('div', { className: 'faust-chapter-meta' },
                      e('span', { className: 'faust-stat' },
                        e('b', null, countParts(refChapter.wordCount || 0, 'sana')[0]), ' ', countParts(refChapter.wordCount || 0, 'sana')[1]),
                      e('span', {
                        className: 'faust-chip ' + (STATUS_CHIP[normStatus(refChapter.status)] || ''),
                        'aria-label': 'Tila: ' + labelOf('status', normStatus(refChapter.status)).toLowerCase()
                      }, labelOf('status', normStatus(refChapter.status))),
                      e('span', { className: 'faust-stat' }, 'vain katselu')
                    )
                  ),
                  e('div', { className: 'faust-page__body' },
                    refChapter.content
                      ? e(FaustEditor, {
                          key: refChapter.id,
                          value: refChapter.content,
                          readOnly: true,
                          label: 'Jaetun näkymän teksti (vain luku)',
                          // The manuscript settings of the Ulkoasu tab, as in the main pane
                          style: {
                            fontFamily: manuscriptFont.stack,
                            fontSize: 'var(--ms-size)',
                            lineHeight: lineSpacing,
                            textAlign: textAlign,
                            paragraphGap: `${Math.max(0, (parseFloat(paragraphSpacing) || 1) - 1) * 0.8}em`,
                            paddingBottom: 'var(--sp-7)'
                          }
                        })
                      : emptyState('Luvussa ei ole vielä tekstiä.')
                  )
                )

            // Split view content area: the pane's one scroller
            : e('div', {
              className: 'faust-editor-content',
              style: { padding: 'var(--sp-5) 0 var(--sp-7)' }
            },
              splitViewType === 'chapter' && emptyState('Valitse luku yllä olevasta valikosta.'),

              // Character view
              splitViewType === 'character' && (() => {
                if (characters.length === 0) return emptyState('Tarinassa ei ole vielä hahmoja.');
                if (!refCharacter) return emptyState('Valitse hahmo yllä olevasta valikosta.');
                const age = charField(refCharacter, 'age');
                const hasAge = age != null && age !== '';
                const occupation = charField(refCharacter, 'occupation');
                const description = charField(refCharacter, 'description');
                const background = charField(refCharacter, 'background');
                const archetype = (refCharacter.archetypal && refCharacter.archetypal.primaryArchetype) ||
                  (refCharacter.archetype && (refCharacter.archetype.archetypeFamily || refCharacter.archetype.primaryArchetype));
                return e('div', { style: { padding: '0 var(--sp-5)' } },
                  viewTitle(charName(refCharacter)),
                  (hasAge || occupation) && e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', marginBottom: 'var(--sp-4)' } },
                    hasAge && infoLine(`Ikä: ${age}`),
                    occupation && infoLine(`Ammatti: ${occupation}`)
                  ),
                  description && section('Kuvaus', authorText(description)),
                  background && section('Tausta', authorText(background)),
                  archetype && section('Arkkityyppi', infoLine(label(archetype))),
                  refCharacter.notes && section('Muistiinpanot', authorText(refCharacter.notes))
                );
              })(),

              // Location view
              splitViewType === 'location' && (() => {
                if (placeEntries.length === 0) return emptyState('Tarinassa ei ole vielä paikkoja.');
                if (!refPlace) return emptyState('Valitse paikka yllä olevasta valikosta.');
                const senses = refPlace.sensoryDetails || {};
                const hasSenses = !!(senses.visual || senses.auditory || senses.olfactory);
                const hasDetails = !!(refPlace.type || refPlace.atmosphere || refPlace.description || hasSenses || refPlace.notes);
                return e('div', { style: { padding: '0 var(--sp-5)' } },
                  viewTitle(refPlace.name || refPlaceEntry[0]),
                  !hasDetails && emptyState('Paikasta ei ole vielä tallennettu tietoja.'),
                  (refPlace.type || refPlace.atmosphere) && e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)', marginBottom: 'var(--sp-4)' } },
                    refPlace.type && infoLine(`Tyyppi: ${labelOf('placeType', refPlace.type).toLowerCase()}`),
                    refPlace.atmosphere && infoLine(`Tunnelma: ${labelOf('placeAtmosphere', refPlace.atmosphere).toLowerCase()}`)
                  ),
                  refPlace.description && section('Kuvaus', authorText(refPlace.description)),
                  hasSenses && section('Aistit',
                    senses.visual && authorText(`Näkö: ${senses.visual}`),
                    senses.auditory && authorText(`Kuulo: ${senses.auditory}`),
                    senses.olfactory && authorText(`Haju: ${senses.olfactory}`)
                  ),
                  refPlace.notes && section('Muistiinpanot', authorText(refPlace.notes))
                );
              })(),

              // Summaries of all chapters
              splitViewType === 'outline' && e('div', { style: { padding: '0 var(--sp-5)' } },
                viewTitle('Lukujen tiivistelmät'),
                e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
                  project.structure.map((ch, idx) => {
                    const summary = ch.synopsis || ch.synopsisAI;
                    return e('div', {
                      key: ch.id,
                      className: ch.id === activeChapterId ? 'faust-card faust-card--compact is-selected' : 'faust-card faust-card--compact',
                      'aria-current': ch.id === activeChapterId ? 'true' : undefined
                    },
                      e('h3', { className: 'faust-card__title', style: { margin: 0 } }, `${idx + 1}. ${ch.title || 'Nimetön luku'}`),
                      summary
                        ? e('p', { className: 'faust-card__body', style: { margin: 0 } }, summary)
                        : e('p', { className: 'faust-meta', style: { margin: 0 } }, 'Ei tiivistelmää')
                    );
                  })
                )
              )
            )
          );
        })()
      ),

      // Right inspector (hidden by default)
      // Always mounted: closed is width 0 (the shell's 300 ms motion); the inner panel keeps its width
      e(ErrorBoundary, { label: 'Tietopaneeli', onDismiss: () => setShowInspector(false) }, e('div', { className: 'faust-inspector', 'data-state': showInspector ? 'open' : 'closed' },
        e('div', { className: 'faust-panel' },
          e('div', { className: 'faust-panel__head' },
            e('h3', { className: 'faust-panel__title' }, 'Tietopaneeli'),
            e('button', {
              className: 'faust-btn faust-btn--icon faust-btn--sm',
              'aria-label': 'Kätke tietopaneeli (' + shortcut('CmdOrCtrl+2') + ')',
              title: 'Kätke tietopaneeli (' + shortcut('CmdOrCtrl+2') + ')',
              onClick: () => setShowInspector(false)
            }, icons.panelRight({ size: 14 }))
          ),

          // Tab Navigation: the row only (arrow keys, Home, End); the panels below stay where they are
          // Five tabs in one dense row (R-40); Tarkistus carries the busy dot while a check runs
          e('div', { className: 'faust-panel__tabs faust-panel__tabs--dense' },
            e(Tabs, {
              label: 'Tietopaneeli',
              value: inspectorTab,
              onChange: setInspectorTab,
              items: [
                { id: 'editor', label: 'Ulkoasu', title: 'Fontti, riviväli, zoomaus, teema ja kirjoittamisen asetukset' },
                { id: 'chapter', label: 'Luku', title: 'Avoimen luvun tiedot ja versiot' },
                { id: 'project', label: 'Projekti', title: 'Projektin tiedot, tavoitteet, hahmot, juonilangat ja johdonmukaisuus' },
                { id: 'ai', label: 'Tekoäly', title: 'Tekoälyn lähde, avain ja malli sekä tekoälyn kirjoitustoiminnot' },
                { id: 'review', label: 'Tarkistus', title: 'Avoimen luvun tarkistukset ja niiden havainnot (' + shortcut('CmdOrCtrl+3') + ')', busy: !!reviewRef.current.view().running }
              ]
            })
          ),

          // The scrolling body holds every block of the four tabs. It is closed by the first ')' of the
          // line '        ))' after the last block of the panel (R-43, the paired edit with inspector-b).
          e('div', { className: 'faust-panel__body' },
          // EDITOR TAB
          inspectorTab === 'editor' && e('section', { className: 'faust-section' },
            e('div', { className: 'faust-section__head' }, e('div', { className: 'faust-section__title' }, 'Ulkoasun asetukset')),

            // Font selector: the faces of MANUSCRIPT_FONTS (FaustEditor.js), which also set the page's measure
            e('div', { className: 'faust-field' },
              e('label', { className: 'faust-field__label', htmlFor: 'inspector-font' }, 'Fontti'),
              e('select', {
                id: 'inspector-font',
                className: 'faust-select faust-select--sm',
                value: editorFont,
                onChange: (ev) => setEditorFont(ev.target.value)
              },
                Object.keys(MANUSCRIPT_FONTS).map((face) => e('option', { key: face, value: face }, face))
              )
            ),

            // Text alignment
            e('div', { className: 'faust-field' },
              e('div', { className: 'faust-field__label' }, 'Tasaus'),
              e('div', { className: 'faust-segmented faust-segmented--block', role: 'group', 'aria-label': 'Tasaus' },
                [
                  ['left', 'Vasen', 'Tasaa vasemmalle'],
                  ['center', 'Keskitetty', 'Keskitä'],
                  ['right', 'Oikea', 'Tasaa oikealle'],
                  ['justify', 'Tasattu', 'Tasaa molemmat reunat']
                ].map(([align, face, tip]) =>
                  e('button', {
                    key: align,
                    className: 'faust-segmented__option',
                    'aria-pressed': textAlign === align,
                    title: tip,
                    onClick: () => setTextAlign(align)
                  }, face)
                )
              )
            ),

            // Line spacing
            e('div', { className: 'faust-field' },
              e('label', { className: 'faust-field__label', htmlFor: 'inspector-line-spacing' }, 'Riviväli'),
              e('select', {
                id: 'inspector-line-spacing',
                className: 'faust-select faust-select--sm',
                value: lineSpacing,
                onChange: (ev) => setLineSpacing(ev.target.value)
              },
                e('option', { value: '1.0' }, '1,0'),
                e('option', { value: '1.15' }, '1,15'),
                e('option', { value: '1.5' }, '1,5'),
                e('option', { value: '1.8' }, '1,8 (oletus)'),
                e('option', { value: '2.0' }, '2,0')
              )
            ),

            // Zoom
            e('div', { className: 'faust-field' },
              e('label', { className: 'faust-field__label', htmlFor: 'inspector-zoom' }, 'Zoomaus'),
              e('select', {
                id: 'inspector-zoom',
                className: 'faust-select faust-select--sm',
                value: editorZoom,
                onChange: (ev) => setEditorZoom(ev.target.value)
              },
                // The menu zooms in steps of 10 (⌘+ / ⌘-): always list the current value
                ...Array.from(new Set(['70', '80', '90', '100', '110', '120', '130', '150', '175', '200', editorZoom]))
                  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
                  .map(value => e('option', { key: value, value }, value === '100' ? '100 % (oletus)' : `${value} %`))
              )
            ),

            // Paragraph spacing
            e('div', { className: 'faust-field' },
              e('label', { className: 'faust-field__label', htmlFor: 'inspector-paragraph-spacing' }, 'Kappaleväli'),
              e('select', {
                id: 'inspector-paragraph-spacing',
                className: 'faust-select faust-select--sm',
                value: paragraphSpacing,
                onChange: (ev) => setParagraphSpacing(ev.target.value)
              },
                e('option', { value: '1.0' }, 'Ei lainkaan'),
                e('option', { value: '1.5' }, 'Keskisuuri (oletus)'),
                e('option', { value: '2.0' }, 'Suuri')
              )
            ),

            // Typewriter Mode toggle
            e('div', { className: 'faust-field' },
              e('div', { className: 'faust-field__label' }, 'Kirjoituskonetila'),
              e('div', { className: 'faust-segmented faust-segmented--block', role: 'radiogroup', 'aria-label': 'Kirjoituskonetila' },
                e('button', {
                  className: 'faust-segmented__option',
                  role: 'radio',
                  'aria-checked': !!typewriterMode,
                  onClick: () => setTypewriterMode(true)
                }, 'Päällä'),
                e('button', {
                  className: 'faust-segmented__option',
                  role: 'radio',
                  'aria-checked': !typewriterMode,
                  onClick: () => setTypewriterMode(false)
                }, 'Pois')
              ),
              e('div', { className: 'faust-field__hint' }, 'Kirjoitusrivi pysyy ruudun keskellä.')
            ),

            // Älykäs kirjoitus (I-06): drawn like Kirjoituskonetila; only for Finnish text
            e(SmartTypingSwitch, {
              value: smartTypingOn !== false,
              onChange: setSmartTypingOn,
              disabledReason: (project.language || 'fi') === 'fi' ? null : 'Älykäs kirjoitus on tehty suomenkieliselle tekstille.'
            }),

            // Theme (W23)
            e('div', { className: 'faust-field' },
              e('div', { className: 'faust-field__label' }, 'Teema'),
              e('div', { className: 'faust-segmented faust-segmented--block', role: 'radiogroup', 'aria-label': 'Teema' },
                e('button', {
                  className: 'faust-segmented__option',
                  role: 'radio',
                  'aria-checked': !!isDarkMode,
                  title: 'Ota käyttöön tumma NOX-teema (' + shortcut('CmdOrCtrl+Shift+D') + ' vaihtaa teemaa)',
                  onClick: () => setIsDarkMode(true)
                }, 'NOX (tumma)'),
                e('button', {
                  className: 'faust-segmented__option',
                  role: 'radio',
                  'aria-checked': !isDarkMode,
                  title: 'Ota käyttöön vaalea DEIS-teema (' + shortcut('CmdOrCtrl+Shift+D') + ' vaihtaa teemaa)',
                  onClick: () => setIsDarkMode(false)
                }, 'DEIS (vaalea)')
              )
            )
          ),

          // CHAPTER TAB
          inspectorTab === 'chapter' && !activeChapter && e('div', { className: 'faust-empty faust-empty--compact' },
            e('div', { className: 'faust-empty__title' }, 'Ei avointa lukua.'),
            e('div', { className: 'faust-empty__hint' }, 'Valitse luku sivupalkista.')
          ),
          inspectorTab === 'chapter' && activeChapter && e('section', { className: 'faust-section' },
            // The chapter title as the heading, with the small line Luvun tiedot under it (M C.7 row 17);
            // the status is the Tila select's (and the editor's meta row)
            e('div', { className: 'faust-serif', style: { font: 'var(--type-title-pop)' } }, activeChapter.title || 'Nimetön luku'),
            e('div', { className: 'faust-meta', style: { marginBottom: 'var(--sp-3)' } }, 'Luvun tiedot'),

            // Status
            e('div', { className: 'faust-field' },
              e('label', { className: 'faust-field__label', htmlFor: 'inspector-chapter-status' }, 'Tila'),
              e('select', {
                id: 'inspector-chapter-status',
                className: 'faust-select faust-select--sm',
                value: normStatus(activeChapter.status),
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    structure: prev.structure.map(ch =>
                      ch.id === activeChapter.id ? { ...ch, status: ev.target.value } : ch
                    )
                  }));
                  setUnsavedChanges(true);
                }
              },
                ['plan', 'draft', 'revision', 'final'].map(status =>
                  e('option', { key: status, value: status }, labelOf('status', status))
                )
              )
            ),

            // Ei tekoälylle (shown also with "Tekoäly pois": it is the author's data)
            e(ChapterNoAIField, {
              chapter: activeChapter,
              onChange: (noAI) => {
                setProject(prev => ({ ...prev, structure: prev.structure.map(ch => ch.id === activeChapter.id ? { ...ch, noAI } : ch) }));
                setUnsavedChanges(true);
              }
            }),

            // POV Character
            e('div', { className: 'faust-field' },
              e('label', { className: 'faust-field__label', htmlFor: 'inspector-chapter-pov' }, 'Näkökulmahahmo'),
              e('select', {
                id: 'inspector-chapter-pov',
                className: 'faust-select faust-select--sm',
                value: activeChapter.povCharacter || '',
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    structure: prev.structure.map(ch =>
                      ch.id === activeChapter.id ? { ...ch, povCharacter: ev.target.value || null } : ch
                    )
                  }));
                  setUnsavedChanges(true);
                }
              },
                e('option', { value: '' }, '— Ei valittu —'),
                project.characters.map(char =>
                  e('option', {
                    key: char.id || char.name,
                    value: char.id || char.name
                  }, char.basicInfo?.name || char.name || 'Nimetön hahmo')
                )
              )
            ),

            // Story Timestamp
            e('div', { className: 'faust-field' },
              e('label', { className: 'faust-field__label', htmlFor: 'inspector-chapter-time' }, 'Tapahtuma-aika'),
              e('input', {
                id: 'inspector-chapter-time',
                className: 'faust-input faust-input--sm faust-input--author',
                type: 'text',
                value: activeChapter.storyTimestamp || '',
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    structure: prev.structure.map(ch =>
                      ch.id === activeChapter.id ? { ...ch, storyTimestamp: ev.target.value } : ch
                    )
                  }));
                  setUnsavedChanges(true);
                },
                placeholder: 'esim. 3. päivä, aamu'
              })
            ),

            // Mood/Tone
            e('div', { className: 'faust-field' },
              e('label', { className: 'faust-field__label', htmlFor: 'inspector-chapter-mood' }, 'Tunnelma'),
              e('input', {
                id: 'inspector-chapter-mood',
                className: 'faust-input faust-input--sm faust-input--author',
                type: 'text',
                value: activeChapter.mood || '',
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    structure: prev.structure.map(ch =>
                      ch.id === activeChapter.id ? { ...ch, mood: ev.target.value } : ch
                    )
                  }));
                  setUnsavedChanges(true);
                },
                placeholder: 'esim. jännittynyt, haikea'
              })
            ),

            // Custom Notes
            e('div', { className: 'faust-field' },
              e('label', { className: 'faust-field__label', htmlFor: 'inspector-chapter-notes' }, 'Muistiinpanot'),
              e('textarea', {
                id: 'inspector-chapter-notes',
                className: 'faust-textarea faust-textarea--author',
                value: activeChapter.notes || '',
                onChange: (ev) => {
                  setProject(prev => ({
                    ...prev,
                    structure: prev.structure.map(ch =>
                      ch.id === activeChapter.id ? { ...ch, notes: ev.target.value } : ch
                    )
                  }));
                  setUnsavedChanges(true);
                },
                placeholder: 'Muistiinpanoja tästä luvusta…'
              })
            ),

            // Open ChapterSheet button (W22)
            e('button', {
              className: 'faust-btn faust-btn--block',
              style: { marginTop: 'var(--sp-4)' },
              onClick: () => setShowChapterSheetModal(true)
            }, 'Kaikki luvun tiedot…')
          ),

          // Parannusehdotukset: the advice stored by the last Analysoi luku or Pika-arvio, a section of its own after
          // Kaikki luvun tiedot… (R-39, MV-66: same content, always listed, no disclosure), so the chapter's fields
          // come first and the advice never pushes them below the fold
          inspectorTab === 'chapter' && activeChapter && activeChapter.aiQuality &&
            Array.isArray(activeChapter.aiQuality.suggestions) && activeChapter.aiQuality.suggestions.length > 0 &&
          e('section', { className: 'faust-section' },
            e('div', { className: 'faust-section__head' }, e('div', { className: 'faust-section__title' }, 'Parannusehdotukset')),
            e('ul', { className: 'faust-serif', style: { margin: 0, paddingLeft: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
              ...activeChapter.aiQuality.suggestions.map((suggestion, idx) =>
                e('li', { key: idx }, String(suggestion))
              )
            )
          ),

          // PROJECT TAB
          inspectorTab === 'project' && e('section', { className: 'faust-section' },
            e('div', { className: 'faust-section__head' }, e('div', { className: 'faust-section__title' }, 'Projektin tiedot')),
            // The project's name and its author are the author's words: serif (V 0.1 rule 3)
            e('div', { className: 'faust-kv' }, e('span', null, 'Nimi:'), e('span', { className: 'faust-serif' }, project.title || 'Nimetön projekti')),
            e('div', { className: 'faust-kv' }, e('span', null, 'Kirjoittaja:'), e('span', { className: 'faust-serif' }, project.author || '–')),
            e('div', { className: 'faust-kv' }, e('span', null, 'Genre:'), e('span', null, project.genre ? labelOf('genre', project.genre).toLowerCase() : '–')),
            e('div', { className: 'faust-kv' }, e('span', null, 'Käsikirjoituksen kieli:'),
              e('span', null, { fi: 'suomi', en: 'englanti' }[project.language || 'fi'] || project.language)),

            // Project settings (W18)
            e('button', {
              className: 'faust-btn faust-btn--block',
              style: { marginTop: 'var(--sp-3)' },
              onClick: () => setShowProjectSettings(true)
            }, 'Projektin asetukset…')
          ),

          // Writing Goals Section (moved here from the Ulkoasu tab: G-move-2)
          inspectorTab === 'project' && e('section', { className: 'faust-section' },
            e('div', { className: 'faust-section__head' }, e('div', { className: 'faust-section__title' }, 'Tavoitteet')),

            // Manuscript goal: the label above, its bar, then the count and the share (M C.8 row 14's words), drawn
            // as the session goal below is (one look for one kind of thing). No-break spaces keep 80 000 sanaa whole.
            (() => {
              const target = (project.targets && Number(project.targets.totalWords)) || 0;
              const share = target > 0 ? Math.min(100, (totalWords / target) * 100) : 0;
              const nb = (text) => text.replace(/ /g, '\u00A0');
              return e('div', null,
                e('div', { className: 'faust-field__label', style: { marginBottom: 'var(--sp-2)' } }, 'Käsikirjoituksen tavoite'),
                target > 0 && e('div', {
                  className: 'faust-progress faust-progress--goal' + (totalWords >= target ? ' is-complete' : '') + (totalWords > 0 ? '' : ' is-empty'),
                  style: { '--value': share + '%' },
                  role: 'progressbar',
                  'aria-label': 'Käsikirjoituksen tavoite',
                  'aria-valuemin': 0,
                  'aria-valuemax': 100,
                  'aria-valuenow': Math.round(share)
                }, e('i')),
                e('div', { className: 'faust-kv', style: { marginTop: 'var(--sp-1)' } },
                  e('span', null, nb(`${totalWords.toLocaleString('fi-FI')} / ${target.toLocaleString('fi-FI')} sanaa`)),
                  target > 0 ? e('span', null, nb(`${Math.round(share)} %`)) : null
                )
              );
            })(),

            // Session goal
            (() => {
              const progress = getSessionProgress();
              const reached = progress.percentage >= 100;
              return e('div', { style: { marginTop: 'var(--sp-4)' } },
                // Label, bar and readout as the manuscript goal has them; the hint follows the readout (V 4.2)
                e('div', { className: 'faust-field__label', style: { marginBottom: 'var(--sp-2)' } }, 'Kirjoituskerran tavoite'),

                // Progress bar
                e('div', {
                  className: 'faust-progress faust-progress--goal' + (reached ? ' is-complete' : '') + (Number(progress.written) > 0 ? '' : ' is-empty'),
                  style: { '--value': progress.percentage + '%' },
                  role: 'progressbar',
                  'aria-label': 'Kirjoituskerran tavoite',
                  'aria-valuemin': 0,
                  'aria-valuemax': 100,
                  'aria-valuenow': progress.percentage
                }, e('i')),

                // Stats
                e('div', { className: 'faust-kv', style: { marginTop: 'var(--sp-1)' } },
                  e('span', null, `${Number(progress.written).toLocaleString('fi-FI')} / ${Number(progress.goal).toLocaleString('fi-FI')} sanaa`),
                  e('span', null, `${progress.percentage} %`)
                ),
                e('div', { className: 'faust-field__hint' }, 'Lasketaan siitä, kun avasit projektin tai nollasit sanalaskurin.'),

                // Goal completed message
                reached && e('div', { className: 'faust-callout faust-callout--success', style: { marginTop: 'var(--sp-2)' } },
                  icons.success({ size: 16, className: 'faust-callout__icon' }),
                  e('div', { className: 'faust-callout__body' }, 'Tavoite saavutettu!')
                ),

                // Goal setter
                e('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' } },
                  e('label', { className: 'faust-field__label', htmlFor: 'inspector-session-goal' }, 'Tavoite:'),
                  e('select', {
                    id: 'inspector-session-goal',
                    className: 'faust-select faust-select--sm',
                    value: sessionGoal,
                    onChange: (ev) => setSessionGoal(parseInt(ev.target.value))
                  },
                    [250, 500, 750, 1000, 1500, 2000].map(words =>
                      e('option', { key: words, value: String(words) }, `${words.toLocaleString('fi-FI')} sanaa`)
                    )
                  )
                ),
                e('div', { className: 'faust-field__row' },
                  // flush: the quiet button's label ends on the field's right edge
                  e('button', {
                    className: 'faust-btn faust-btn--sm faust-btn--quiet faust-btn--flush-end',
                    title: 'Aloita kirjoituskerran sanalaskenta alusta',
                    onClick: resetSession
                  }, 'Nollaa sanalaskuri')
                )
              );
            })()
          ),

          // AI provider: Claude directly or Cherry Studio's local gateway; hidden, not unmounted, on the other tabs
          e('div', { style: { display: inspectorTab === 'ai' ? 'block' : 'none' } },
            e(AIProviderSettings, {
              onProviderChange: setAiSource,
              // Poista avain asks first (stage amendments 0.6)
              askConfirm,
              // Koepyyntö with the open chapter's context: what the real actions would assemble
              getEditorContext: () => ({
                project: projectRef.current,
                chapterId: liveContentRef.current.chapterId,
                text: liveContentRef.current.content,
                selection: editorRef.current ? { from: editorRef.current.selectionStart, to: editorRef.current.selectionEnd } : null
              })
            })
          ),

          // AI TAB (with "Tekoäly pois" only the settings block above stays)
          inspectorTab === 'ai' && !aiDisabled && (() => {
            // The Finnish description of each mode (menu spec A.3); the stored names and colours are not shown
            const modeTips = {
              exploration: 'Ideointi: tekoäly kokeilee rohkeasti ja tarjoaa vaihtoehtoja',
              production: 'Kirjoitus: tekoäly seuraa suunnitelmaa ja tarinan linjaa',
              polish: 'Viimeistely: tekoäly hioo kieltä ja tyyliä ja muuttaa sisältöä vain vähän'
            };
            return e('section', { className: 'faust-section' },
              e('div', { className: 'faust-section__head' }, e('div', { className: 'faust-section__title' }, 'Tekoälyn työtapa')),

              // Mode selector buttons
              e('div', { className: 'faust-segmented faust-segmented--block', role: 'group', 'aria-label': 'Tekoälyn työtapa' },
                Object.keys(project.ai.modes).map(modeName =>
                  e('button', {
                    key: modeName,
                    className: 'faust-segmented__option',
                    'aria-pressed': project.ai.currentMode === modeName,
                    title: modeTips[modeName],
                    onClick: () => setAIMode(modeName)
                  }, labelOf('mode', modeName))
                )
              ),

              // Current mode info
              // Standing as a help line it ends with a full stop, as every help line of the tab (the tooltip keeps M's form)
              modeTips[project.ai.currentMode] && e('div', { className: 'faust-meta', style: { marginTop: 'var(--sp-2)' } },
                modeTips[project.ai.currentMode] + '.')
            );
          })(),

          // Continue Writing (HybridWritingFlow); not in a chapter marked "Ei tekoälylle"
          inspectorTab === 'ai' && !aiDisabled && !chapterNoAI && e('section', { className: 'faust-section' },
            e('div', { className: 'faust-section__head' }, e('div', { className: 'faust-section__title' }, 'Kirjoita tekoälyn kanssa')),

            e('button', {
              className: 'faust-btn faust-btn--block faust-btn--primary',
              onClick: () => openAiWriting(),
              disabled: !activeChapter || !hybridFlowRef.current,
              title: !activeChapter ? 'Avaa ensin luku' : !hybridFlowRef.current ? 'Tekoälytoiminnot latautuvat vielä.' : undefined
            }, 'Kirjoita tekoälyn kanssa…'),

            e('div', { className: 'faust-meta', style: { marginTop: 'var(--sp-2)' } },
              'Tekoäly jatkaa tekstiä, kirjoittaa tiivistelmästä tekstiä, kirjoittaa valinnan uudelleen tai kirjoittaa kohtauksen.')
          ),

          // Batch Generation
          inspectorTab === 'ai' && !aiDisabled && (() => {
            // Which of the two commands runs (the busy face goes on that button; a rewrite runs neither)
            const oneRunning = magnumOpusRun === 'one';
            const allRunning = magnumOpusRun === 'all';
            const runningTip = 'Magnum Opus on käynnissä: tekoäly kirjoittaa lukua…';
            const notReadyTip = 'Tekoälytoiminnot latautuvat vielä.';
            const busyFace = e('span', { className: 'faust-spinner faust-spinner--sm', 'aria-hidden': 'true' });
            return e('section', { className: 'faust-section' },
              e('div', { className: 'faust-section__head' },
                // A kept name is never set in capitals (M A.1); its sigil is drawn in the gold line
                e('div', { className: 'faust-section__title' }, icons.stone({ size: 14, className: 'faust-icon--sigil' }), ' ', e('span', { className: 'faust-kept-name' }, 'Magnum Opus'))),
              e('div', { className: 'faust-meta', style: { marginBottom: 'var(--sp-3)' } },
                'Tekoäly kirjoittaa kokonaisia lukuja alusta loppuun.'),

              // Cost estimation: the model the chapters are written with comes first (R-17)
              e('div', { className: 'faust-card faust-card--compact', style: { marginBottom: 'var(--sp-3)' } },
                e('div', { className: 'faust-card__title' }, 'Kustannusarvio'),
                e(AiModelBadge, { role: 'default', onOpenSettings: openAISettings, config: aiSource }),
                // A count is a key-value row, as in Tekoälyn kustannukset below
                e('div', { className: 'faust-kv' }, e('span', null, 'Lukuja:'), e('span', null, project.structure.length.toLocaleString('fi-FI'))),
                e('div', { className: 'faust-meta' },
                  aiSource && aiSource.provider === 'cherry'
                    ? 'Hinta riippuu Cherry Studiossa valitusta mallista.'
                    : 'Hinta: ei arviota tälle mallille')
              ),

              // Magnum Opus, one chapter (W26); not in a chapter marked "Ei tekoälylle"
              !chapterNoAI && e('button', {
                className: 'faust-btn faust-btn--block',
                onClick: () => generateChapter(activeChapterId),
                disabled: !activeChapter || isGenerating || !batchProcessorRef.current,
                'aria-busy': oneRunning || undefined,
                title: isGenerating ? runningTip
                  : !activeChapter ? 'Avaa ensin luku'
                  : !batchProcessorRef.current ? notReadyTip
                  : 'Magnum Opus – kirjoita luku tekoälyllä: tekoäly kirjoittaa koko luvun ja käyttää pohjana luvun otsikkoa ja aiempia lukuja. Jos luvussa on jo tekstiä, se korvataan; tästä kysytään ensin.'
              }, oneRunning ? busyFace : icons.stone({ size: 14, className: 'faust-icon--sigil' }), oneRunning ? 'Kirjoitetaan lukua…' : 'Kirjoita luku…'),

              // Magnum Opus, all chapters
              e('button', {
                className: 'faust-btn faust-btn--block',
                style: { marginTop: 'var(--sp-2)' },
                onClick: () => askAndGenerateAllChapters(),
                disabled: isGenerating || !batchProcessorRef.current,
                'aria-busy': allRunning || undefined,
                title: isGenerating ? runningTip
                  : !batchProcessorRef.current ? notReadyTip
                  : 'Tekoäly kirjoittaa jokaisen luvun alusta ja korvaa nykyisen tekstin. Tästä kysytään ensin.'
              }, allRunning ? busyFace : icons.stone({ size: 14, className: 'faust-icon--sigil' }), allRunning ? 'Kirjoitetaan lukuja…' : 'Kirjoita kaikki luvut…')
            );
          })(),

          // AI Cost Tracking
          inspectorTab === 'ai' && !aiDisabled && costOptimizerRef.current && (() => {
            const stats = costOptimizerRef.current.getStats();
            const providers = Object.keys(stats.byProvider || {});

            return e('section', { className: 'faust-section' },
              e('div', { className: 'faust-section__head' },
                e('div', { className: 'faust-section__title' }, 'Tekoälyn kustannukset')
              ),
              e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
                // Overall stats
                e('div', { className: 'faust-card faust-card--compact' },
                  e('div', { className: 'faust-kv' }, e('span', null, 'Yhteensä:'), e('span', null, formatCostFi(stats.totalSpent))),
                  e('div', { className: 'faust-kv' }, e('span', null, 'Pyyntöjä:'), e('span', null, (stats.totalRequests || 0).toLocaleString('fi-FI'))),
                  e('div', { className: 'faust-kv' }, e('span', null, 'Käsiteltyä tekstiä (tokenia):'), e('span', null, (stats.totalTokens || 0).toLocaleString('fi-FI'))),
                  e('div', { className: 'faust-kv' }, e('span', null, 'Keskimäärin / pyyntö:'), e('span', null, formatCostFi(stats.averageCostPerRequest)))
                ),

                // By source: not rendered while every request is booked under one source
                providers.length > 1 && e('details', { className: 'faust-disclosure' },
                  e('summary', null, icons.chevronRight({ size: 14 }), `Kustannukset lähteittäin (${providers.length})`),
                  e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)' } },
                    providers.map(provider => {
                      const providerStats = stats.byProvider[provider] || {};
                      return e('div', { key: provider, className: 'faust-card faust-card--compact' },
                        e('div', { className: 'faust-kv' }, e('span', null, labelOf('costSource', provider)), e('span', null, formatCostFi(providerStats.cost))),
                        e('div', { className: 'faust-meta' },
                          `${count(providerStats.requests || 0, 'pyyntö')} · ${(providerStats.tokens || 0).toLocaleString('fi-FI')} tokenia`)
                      );
                    })
                  )
                ),

                e('button', {
                  type: 'button',
                  className: 'faust-btn faust-btn--block',
                  onClick: async () => {
                    if (!(await askConfirm('Nollataanko kustannuslaskuri?', 'Kertyneet kustannustiedot poistetaan. Projektin teksti ei muutu.', 'Nollaa kustannuslaskuri', 'Peruuta', { danger: true }))) return;
                    costOptimizerRef.current.reset();
                    setProject(prev => ({ ...prev }));
                  }
                }, 'Nollaa kustannuslaskuri')
              )
            );
          })(),

          // TARKISTUS TAB (stage I-08): the checks of the open chapter and their findings. Every other block of
          // the body is gated by its own tab (R-26), so nothing else shows under this one.
          inspectorTab === 'review' && e(ErrorBoundary, { label: 'Tarkistus', onDismiss: () => setInspectorTab('chapter') },
            e(ReviewPanel, {
              controller: reviewRef.current,
              view: reviewRef.current.view(),
              project,
              chapter: activeChapter,
              text: liveContentRef.current.content,
              aiOff: aiDisabled,
              aiConfig: aiSource,
              onOpenLanguageTool: setLanguagePanel,
              onOpenProjectSettings: () => setShowProjectSettings(true),
              onOpenAISettings: openAISettings,
              onOpenCodexEntry: openCodexEntry,
              onSelectChapter: setActiveChapterId,
              onEditCheck: setReviewCheckRequest,
              askConfirm
            })),

          // Story Continuity Tracker
          inspectorTab === 'project' && continuityTrackerRef.current && (() => {
            const cont = project.continuity || {};
            const characters = Object.values(cont.characters || {});
            const locations = Object.values(cont.locations || {});

            return e('section', { className: 'faust-section' },
              e('div', { className: 'faust-section__head' },
                e('div', { className: 'faust-section__title' }, 'Tarinan tiedot')
              ),
              e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
                e('div', { className: 'faust-meta' }, 'Hahmot ja paikat, jotka tekoäly on poiminut luvuista.'),

                // Read-only counts are .faust-kv rows on the panel's edge, as under Projektin tiedot (one recipe, V 4.4)
                e('div', null,
                  e('div', { className: 'faust-kv' }, e('span', null, 'Hahmoja:'), e('span', null, characters.length.toLocaleString('fi-FI'))),
                  e('div', { className: 'faust-kv' }, e('span', null, 'Paikkoja:'), e('span', null, locations.length.toLocaleString('fi-FI')))
                ),

                e('button', {
                  type: 'button',
                  className: 'faust-btn faust-btn--block',
                  title: 'Avaa luettelo tarinan tapahtumapaikoista',
                  onClick: () => setShowLocationSheet(true)
                }, icons.terra({ size: 14 }), `Avaa paikat (${locations.length})`),

                // Characters by chapter
                characters.length > 0 && e('details', { className: 'faust-disclosure' },
                  e('summary', null, icons.chevronRight({ size: 14 }), e('span', null, icons.sol({ size: 14 })), `Hahmot luvuittain (${characters.length})`),
                  e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)' } },
                    characters.slice(0, 20).map(char => {
                      const chapters = char.appearances || [];
                      return e('div', { key: char.name, className: 'faust-card faust-card--compact' },
                        e('div', { className: 'faust-card__title' }, char.name),
                        chapters.length > 0 && e('div', { className: 'faust-meta' },
                          `Esiintyy ${chapters.length} luvussa: ${chapters.slice(0, 5).map(i => i + 1).join(', ')}${chapters.length > 5 ? '…' : ''}`)
                      );
                    }),
                    characters.length > 20 && e('div', { className: 'faust-meta' }, `… ja ${count(characters.length - 20, 'muu')}`)
                  )
                ),

                // Locations by chapter
                locations.length > 0 && e('details', { className: 'faust-disclosure' },
                  e('summary', null, icons.chevronRight({ size: 14 }), e('span', null, icons.terra({ size: 14 })), `Paikat luvuittain (${locations.length})`),
                  e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)' } },
                    locations.slice(0, 15).map(loc => {
                      const chapters = loc.appearances || [];
                      return e('div', { key: loc.name, className: 'faust-card faust-card--compact' },
                        e('div', { className: 'faust-card__title' }, loc.name),
                        e('div', { className: 'faust-meta' },
                          Number.isInteger(loc.firstMentioned)
                            ? `Ensimmäinen maininta: luku ${loc.firstMentioned + 1} · esiintyy ${chapters.length} luvussa`
                            : `Esiintyy ${chapters.length} luvussa`)
                      );
                    }),
                    locations.length > 15 && e('div', { className: 'faust-meta' }, `… ja ${count(locations.length - 15, 'muu')}`)
                  )
                )
              )
            );
          })(),

          // Version History (for active chapter)
          inspectorTab === 'chapter' && activeChapter && (() => {
            const versions = activeChapter.versions || [];
            const [versionTotal, versionNoun] = countParts(versions.length, 'versio');

            return e('section', { className: 'faust-section' },
              e('div', { className: 'faust-section__head' },
                e('div', { className: 'faust-section__title' }, 'Luvun versiot')
              ),
              e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
                versions.length === 0
                  ? e('div', { className: 'faust-empty faust-empty--compact' },
                      e('div', { className: 'faust-empty__title' }, 'Ei vielä versioita.'),
                      e('div', { className: 'faust-empty__hint' }, 'Versio tallentuu, kun tekoäly kirjoittaa luvun tai kirjoittaa sen uudelleen.')
                    )
                  : e('div', null, e('span', { className: 'faust-stat' }, e('b', null, versionTotal), versionNoun)),

                // Version list (the last five, newest first)
                versions.slice(-5).reverse().map((version) => {
                  const isCurrent = version.id === activeChapter.currentVersion;
                  const versionNo = String(version.id).replace(/\D/g, '');
                  // Date as in the dialog Luvun versiot (M B.13: 5.11.2026 klo 9.07); no line for a missing or invalid time
                  const versionDate = version.timestamp ? new Date(version.timestamp) : null;
                  const dateLine = versionDate && !Number.isNaN(versionDate.getTime())
                    ? versionDate.toLocaleDateString('fi-FI') + ' klo ' + versionDate.toLocaleTimeString('fi-FI', { hour: 'numeric', minute: '2-digit' })
                    : '';
                  const from = version.generatedFrom || {};
                  const instruction = typeof from.userFeedback === 'string' ? from.userFeedback.trim() : '';
                  const origin = from.mode === 'manual'
                    ? 'Oma teksti'
                    : instruction
                      ? `Kirjoitettu uudelleen ohjeella: ”${instruction}”`
                      : 'Tekoälyn kirjoittama' + (from.mode ? ` · työtapa: ${labelOf('mode', from.mode).toLowerCase()}` : '');
                  const rating = version.userRating || 0;

                  return e('div', { key: version.id, className: 'faust-card faust-card--compact', 'aria-current': isCurrent ? 'true' : undefined },
                    e('div', { className: 'faust-card__title' }, `Versio ${versionNo}${isCurrent ? ' (nykyinen)' : ''}`),
                    dateLine && e('div', { className: 'faust-meta' }, dateLine),
                    e('div', { className: 'faust-meta' }, origin),
                    e('div', { className: 'faust-meta' },
                      count(versionWords(version), 'sana') +
                      (version.cost > 0 ? ` · ${formatCostFi(version.cost)}` : '')),
                    version.userFeedback && e('div', { className: 'faust-meta' }, `Oma kommentti: ”${version.userFeedback}”`),

                    // Own rating: five stars (Rating); each keeps the comment (third argument)
                    e('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' } },
                      e('span', { className: 'faust-meta' }, 'Oma arvio:'),
                      e(Rating, {
                        label: 'Oma arvio',
                        value: rating,
                        onChange: (n) => rateVersion(version.id, n, version.userFeedback || null)
                      })
                    ),

                    e('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--sp-2)' } },
                      // M C.8 row 8: a text link after the stars
                      e('button', {
                        type: 'button',
                        className: 'faust-link',
                        onClick: async () => {
                          const text = await askText('Oma kommentti versiosta (valinnainen)', version.userFeedback || '', '', 'Tallenna kommentti');
                          if (text === null || text === undefined) return;
                          rateVersion(version.id, version.userRating, text || null);
                        }
                      }, version.userFeedback ? 'Muokkaa kommenttia…' : 'Lisää kommentti…'),

                      // Restore (only if not current)
                      !isCurrent && e('button', {
                        type: 'button',
                        className: 'faust-btn faust-btn--sm',
                        title: 'Palauta tämä versio luvun tekstiksi',
                        onClick: async () => {
                          if (!(await askConfirm(`Palautetaanko versio ${versionNo}?`, `Luvun ”${activeChapter.title || 'Nimetön luku'}” nykyinen teksti korvataan versiolla ${versionNo}.`, 'Palauta versio', 'Peruuta', { danger: true }))) return;
                          restoreVersion(version.id);
                        }
                      }, 'Palauta…')
                    )
                  );
                }),

                // Rewrite the chapter with an instruction
                !aiDisabled && !chapterNoAI && e('button', {
                  type: 'button',
                  className: 'faust-btn faust-btn--block',
                  title: 'Tekoäly kirjoittaa koko luvun uudelleen ohjeesi mukaan ja korvaa luvun nykyisen tekstin.',
                  onClick: () => {
                    if (chapterNoAI) { notify('warning', MESSAGES.noAI); return; }
                    setShowRegenerateDialog(true);
                  },
                  disabled: isGenerating,
                  'aria-busy': isGenerating
                }, isGenerating && e('span', { className: 'faust-spinner faust-spinner--sm' }), isGenerating ? 'Kirjoitetaan…' : 'Kirjoita luku uudelleen…'),

                // The whole list in the dialog Luvun versiot
                versions.length > 0 && e('button', {
                  type: 'button',
                  className: 'faust-btn faust-btn--block',
                  onClick: () => setShowVersionHistory(true)
                }, `Näytä kaikki versiot (${versions.length})`)
              )
            );
          })(),

          // Plot Threads
          inspectorTab === 'project' && e('section', { className: 'faust-section' },
            e('div', { className: 'faust-section__head' },
              e('div', { className: 'faust-section__title' }, 'Juonilangat')
            ),
            e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
              // Thread stats, cards and warnings
              plotThreadTrackerRef.current && plotThreads.length > 0 && (() => {
                const stats = plotThreadTrackerRef.current.getStats();
                const warnings = plotThreadTrackerRef.current.getWarnings();
                const chapterTotal = (project.structure || []).length;
                const threadStripes = ['var(--thread-1)', 'var(--thread-2)', 'var(--thread-3)', 'var(--thread-4)', 'var(--thread-5)', 'var(--thread-6)'];
                // The service writes its messages in mixed language: each text is rebuilt from the type
                const describeWarning = (w) => {
                  const threadName = w.threadName || 'Nimetön juonilanka';
                  if (w.type === 'forgotten_thread') {
                    return [`Juonilankaa ”${threadName}” ei ole mainittu ${chapterTotal - 1 - w.lastMentioned} lukuun`, 'Mainitse juonilanka tai ratkaise se lähiluvuissa.'];
                  }
                  if (w.type === 'unresolved_ending') {
                    return [`Juonilanka ”${threadName}” on ratkaisematta`, 'Ratkaise juonilanka ennen tarinan loppua.'];
                  }
                  if (w.type === 'too_many_questions') {
                    const questionThread = (project.plotThreads || []).find(t => t.id === w.threadId);
                    const questions = questionThread && Array.isArray(questionThread.openQuestions) ? questionThread.openQuestions.length : 0;
                    if (questions > 0) return [`Juonilangassa ”${threadName}” on ${questions} avointa kysymystä`, 'Vastaa osaan kysymyksistä tulevissa luvuissa.'];
                  }
                  return [w.message, w.recommendation];
                };

                return e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
                  e('div', { className: 'faust-meta' },
                    `${count(stats.total, 'juonilanka')} · ${stats.active} avoinna · ${stats.resolved} ratkaistu`),

                  // Threads list
                  plotThreads.slice(0, 5).map((thread, idx) => {
                    const timeline = plotThreadTrackerRef.current.getTimeline(thread.id);
                    const firstChapter = timeline && timeline.length > 0 ? timeline[0].chapterIndex + 1 : null;
                    const lastChapter = timeline && timeline.length > 0 ? timeline[timeline.length - 1].chapterIndex + 1 : null;
                    const statusChip = thread.status === 'resolved' ? 'faust-chip faust-chip--success faust-chip--dot'
                      : thread.status === 'abandoned' ? 'faust-chip faust-chip--struck'
                        : 'faust-chip faust-chip--hollow';
                    const kind = [
                      thread.type && labelOf('threadType', thread.type),
                      thread.priority && `tärkeys: ${labelOf('priority', thread.priority).toLowerCase()}`
                    ].filter(Boolean).join(' · ');

                    return e('div', {
                      key: thread.id,
                      className: 'faust-card faust-card--compact faust-card--stripe',
                      style: { '--stripe': threadStripes[idx % threadStripes.length] }
                    },
                      e('div', { className: 'faust-card__head' },
                        e('span', { className: 'faust-card__title' }, thread.name || 'Nimetön juonilanka'),
                        thread.status && e('span', { className: statusChip }, labelOf('threadStatus', thread.status))
                      ),
                      kind && e('div', { className: 'faust-meta' }, kind),
                      firstChapter !== null && e('div', { className: 'faust-meta' },
                        firstChapter === lastChapter ? `Luku ${firstChapter}` : `Luvut ${firstChapter}–${lastChapter}`)
                    );
                  }),

                  plotThreads.length > 5 && e('div', { className: 'faust-meta' },
                    `… ja ${count(plotThreads.length - 5, 'muu')} ${countParts(plotThreads.length - 5, 'juonilanka')[1]}`),

                  // Warnings: one list, the advice under each warning
                  warnings.length > 0 && e('div', { className: 'faust-callout faust-callout--warning' },
                    icons.warning({ size: 16, className: 'faust-callout__icon' }),
                    e('div', { className: 'faust-callout__title' }, `Varoitukset (${warnings.length})`),
                    e('div', { className: 'faust-callout__body', style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
                      warnings.slice(0, 5).map((w, idx) => {
                        const [warningText, advice] = describeWarning(w);
                        return e('div', { key: idx },
                          e('div', null, warningText),
                          advice && e('div', { className: 'faust-meta' }, advice)
                        );
                      }),
                      warnings.length > 5 && e('div', { className: 'faust-meta' },
                        `… ja ${count(warnings.length - 5, 'muu')} ${countParts(warnings.length - 5, 'varoitus')[1]}`)
                    )
                  )
                );
              })(),

              // Detect threads button
              !aiDisabled && e('button', {
                type: 'button',
                className: 'faust-btn faust-btn--block',
                title: 'Tekoäly lukee käsikirjoituksen ja tunnistaa juonilangat. Nykyinen juonilankaluettelo korvataan.',
                onClick: detectPlotThreads,
                disabled: detectingThreads || !plotThreadTrackerRef.current,
                'aria-busy': detectingThreads
              },
                detectingThreads && e('span', { className: 'faust-spinner faust-spinner--sm' }),
                detectingThreads ? 'Tunnistetaan…' : plotThreads.length > 0 ? 'Tunnista juonilangat uudelleen' : 'Tunnista juonilangat'
              ),

              e('button', {
                type: 'button',
                className: 'faust-btn faust-btn--block',
                title: 'Avaa luettelo juonista, joita seurataan luvusta toiseen',
                onClick: () => setShowThreadSheet(true)
              }, icons.lemniscate({ size: 14 }), `Avaa juonilangat (${(project.plotThreads || []).length})`)
            )
          ),

          // Consistency Check
          inspectorTab === 'project' && (() => {
            // Only a complete check of the open project that found nothing says so
            const checkedClean = consistencyChecked && !checkingConsistency && consistencyErrors.length === 0;
            const markCount = activeChapter
              ? (activeChapter.annotations || []).filter(a => a.type === 'ai_consistency' || a.type === 'ai-consistency').length
              : 0;
            const [errorTotal, errorNoun] = countParts(consistencyErrors.length, 'ristiriita');
            const severityTotal = (levels) => consistencyErrors.filter(err => levels.includes(err.severity)).length;
            const severities = [
              ['Vakavia', severityTotal(['critical']), 'faust-chip faust-chip--error faust-chip--dot'],
              ['Tärkeitä', severityTotal(['high']), 'faust-chip faust-chip--error faust-chip--dot'],
              ['Lieviä', severityTotal(['medium', 'low']), 'faust-chip faust-chip--warning faust-chip--dot']
            ].filter(row => row[1] > 0);
            const errorTitles = {
              character_inconsistency: 'Hahmon ristiriita',
              name_variation: 'Nimen kirjoitusasu vaihtelee',
              timeline_error: 'Aikajanan ristiriita',
              location_inconsistency: 'Paikan ristiriita'
            };
            // The service writes three types in English: the text is rebuilt from the fields
            const errorBody = (err) => {
              if (err.type === 'name_variation') return 'Kirjoitusasut: ' + (err.variations || []).join(', ');
              if ((err.type === 'timeline_error' || err.type === 'location_inconsistency') && err.description) return err.description;
              return err.message;
            };
            const errorFix = (err) => {
              if (err.type === 'name_variation') return `Käytä kaikkialla muotoa ”${err.characterName || (err.variations || [])[0] || ''}”.`;
              if (err.suggestedFix === 'Manual review needed') return 'Tarkista käsin.';
              return err.suggestedFix;
            };

            return e('section', { className: 'faust-section' },
              e('div', { className: 'faust-section__head' },
                e('div', { className: 'faust-section__title' }, 'Johdonmukaisuus')
              ),
              e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
                e('div', { className: 'faust-meta' }, 'Tekoäly tarkistaa hahmot, aikajanan ja paikat ristiriitojen varalta.'),

                markCount > 0 && e('div', { className: 'faust-meta' }, `Ristiriitamerkintöjä tässä luvussa: ${markCount}`),

                // Error summary
                consistencyErrors.length > 0
                  ? e('div', null, e('span', { className: 'faust-stat' }, e('b', null, errorTotal), errorNoun))
                  : checkedClean && e('div', { className: 'faust-meta' }, 'Ristiriitoja ei löytynyt.'),

                // Errors by severity
                severities.length > 0 && e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-1) var(--sp-3)' } },
                  severities.map(([word, n, chip]) => e('span', { key: word, className: 'faust-stat' },
                    e('span', { className: chip }, word),
                    e('b', null, n.toLocaleString('fi-FI'))
                  ))
                ),

                // Error list
                consistencyErrors.slice(0, 5).map((err, idx) => {
                  const fix = errorFix(err);
                  return e('div', {
                    key: idx,
                    className: 'faust-card faust-card--compact faust-card--stripe',
                    style: { '--stripe': err.severity === 'critical' || err.severity === 'high' ? 'var(--error)' : 'var(--warning)' }
                  },
                    e('div', { className: 'faust-card__title' }, errorTitles[err.type] || 'Ristiriita'),
                    e('div', { className: 'faust-ui' }, errorBody(err)),
                    fix && e('div', { className: 'faust-meta' }, `Korjausehdotus: ${fix}`)
                  );
                }),

                consistencyErrors.length > 5 && e('div', { className: 'faust-meta' },
                  `… ja ${count(consistencyErrors.length - 5, 'muu')} ${countParts(consistencyErrors.length - 5, 'ristiriita')[1]}`),

                // Check button
                !aiDisabled && e('button', {
                  type: 'button',
                  className: 'faust-btn faust-btn--block',
                  onClick: runConsistencyCheck,
                  disabled: checkingConsistency || !consistencyCheckerRef.current,
                  'aria-busy': checkingConsistency
                },
                  checkingConsistency && e('span', { className: 'faust-spinner faust-spinner--sm' }),
                  checkingConsistency ? 'Tarkistetaan…' : consistencyErrors.length > 0 ? 'Tarkista uudelleen' : 'Tarkista johdonmukaisuus'
                )
              )
            );
          })(),

          // Characters
          inspectorTab === 'project' && (() => {
            const plan = project.castPlan || {};
            const characterTotal = (project.characters || []).length;

            return e('section', { className: 'faust-section' },
              e('div', { className: 'faust-section__head' },
                e('div', { className: 'faust-section__title' }, 'Hahmot')
              ),
              e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
                plan.defined
                  ? e('div', { className: 'faust-meta' }, `${characterTotal} / ${plan.totalCharacters} suunnitellusta hahmosta luotu`)
                  : e('div', { className: 'faust-meta' }, 'Hahmoja ei ole vielä suunniteltu'),

                // Character types of the hahmosuunnitelma
                plan.defined && (plan.characterTypes || []).length > 0 && e('div', null,
                  plan.characterTypes.map((type, idx) =>
                    e('div', { key: idx, className: 'faust-meta' },
                      `${idx + 1}. ${type.length > 30 ? type.substring(0, 30) + '…' : type}`)
                  )
                ),

                !aiDisabled && e('button', {
                  type: 'button',
                  className: 'faust-btn faust-btn--block',
                  title: 'Kerro, millaisia hahmoja tarinassa on. Tekoäly ehdottaa niille arkkityyppejä.',
                  onClick: () => openCastPlan()
                }, plan.defined ? 'Muokkaa hahmosuunnitelmaa…' : 'Suunnittele hahmot…'),

                // A disabled button shows no tooltip of its own: the span carries it
                !aiDisabled && e('span', {
                  title: plan.defined ? 'Tee yhdestä suunnitellusta hahmotyypistä yksityiskohtainen hahmo tekoälyn avulla' : 'Suunnittele ensin hahmot',
                  style: { display: 'block' }
                },
                  e('button', {
                    type: 'button',
                    className: 'faust-btn faust-btn--block',
                    disabled: !plan.defined,
                    onClick: () => openCharacterBuilder()
                  }, icons.sol({ size: 14 }), '+ Uusi hahmo…')
                ),

                e('button', {
                  type: 'button',
                  className: 'faust-btn faust-btn--block',
                  title: 'Avaa luettelo tarinan hahmoista ja heidän profiileistaan',
                  onClick: () => openCharacterList()
                }, icons.sol({ size: 14 }), `Avaa hahmot (${characterTotal})`)
              )
            );
          })(),

        ))
      )),

      // AI Assistant Panel (Cursor-style) - Slides in from right
      // Docked in the right column beside Tietopaneeli (R-42): one of the two is open at a time. Always
      // mounted, like Tietopaneeli: closed is width 0, and the conversation is kept while it is closed.
      e(ErrorBoundary, { label: 'Liminal Engine', onDismiss: () => setAiAssistantOpen(false) }, e('div', { className: 'faust-aipanel', 'data-state': engineShown ? 'open' : 'closed' },
        e('div', { className: 'faust-panel' },
        [
          // Header
          e('div', { key: 'header', className: 'faust-panel__head' },
            e('div', { style: { minWidth: 0 } },
              e('div', { className: 'faust-panel__title' }, icons.star8({ size: 14 }), 'Liminal Engine'),
              e('div', { className: 'faust-meta' }, 'Tekoälyavustaja')
            ),
            // The right column's one head recipe (V 6.2): the same 24px button as Tietopaneeli's, with the
            // toggle's wording; its face is the close icon (menu-visual entry 57), since panelRight is the
            // Tietopaneeli toggle's own face. The focus goes to the manuscript when it was in the panel.
            e('button', {
              className: 'faust-btn faust-btn--icon faust-btn--sm',
              onClick: () => closePanelKeepingFocus('.faust-aipanel', () => setAiAssistantOpen(false)),
              'aria-label': 'Kätke Liminal Engine (' + shortcut('CmdOrCtrl+Shift+K') + ')',
              title: 'Kätke Liminal Engine (' + shortcut('CmdOrCtrl+Shift+K') + ')'
            }, icons.close({ size: 14 }))
          ),

          // The model the panel's requests go to, and the way to change it (W21, R-85)
          e('div', {
            key: 'model-selector',
            // No rule under the head, as in Tietopaneeli: the block's own rule closes it below
            style: {
              padding: 'var(--sp-1) calc(var(--sp-4) + var(--scrollbar-w)) var(--sp-3) var(--sp-4)',
              borderBottom: 'var(--bw) solid var(--rule)'
            }
          },
            e(AiModelBadge, { role: 'default', onOpenSettings: openAISettings, config: aiSource })
          ),

          // Selected text context badge (a chapter marked "Ei tekoälylle" sends no selection)
          textSelection && !chapterNoAI ? e('div', {
            key: 'text-selection',
            className: 'faust-excerpt',
            style: { margin: 'var(--sp-3) var(--sp-4) 0' }
          },
            e('span', { className: 'faust-excerpt__caption' }, 'Valittu teksti'),
            e('span', { className: 'faust-excerpt__text' }, textSelection.text.slice(0, 400))
          ) : null,

          // Chat messages
          e('div', {
            key: 'chat-messages',
            className: 'faust-panel__body',
            style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }
          },
            aiChatMessages.length === 0
              ? e('div', { className: 'faust-empty' },
                  e('span', { className: 'faust-empty__icon' }, icons.star8({ size: 40 })),
                  e('div', { className: 'faust-empty__title' }, 'Valitse tekstiä ja pyydä siihen muutoksia, tai kysy neuvoa kirjoittamiseen.')
                )
              : aiChatMessages.map((msg, idx) =>
                  e('div', { key: idx, className: 'chat-message ' + msg.role },
                    e('div', { className: 'message-role' },
                      msg.role === 'user' ? 'Sinä' : msg.role === 'error' ? 'Virhe' : 'Tekoäly'),
                    msg.selectedText ? e('div', { className: 'faust-excerpt', style: { marginBottom: 'var(--sp-2)' } },
                      e('span', { className: 'faust-excerpt__text' }, msg.selectedText.slice(0, 400))
                    ) : null,
                    e('div', { className: 'message-content' }, msg.content)
                  )
                ),
            // Waiting for the answer
            aiChatProcessing ? e('div', { className: 'streaming-indicator' },
              e('span', { className: 'dot' }),
              e('span', { className: 'dot' }),
              e('span', { className: 'dot' })
            ) : null
          ),

          // AI Suggestion diff preview
          aiSuggestion && !aiSuggestion.applied ? e('div', {
            key: 'suggestion',
            className: 'faust-result',
            style: { maxHeight: '50%', borderTop: 'var(--bw) solid var(--rule)' }
          },
            e('div', { className: 'faust-result__head' },
              e('span', { className: 'faust-label' }, 'Ehdotus valitun tekstin tilalle')
            ),
            e('div', { className: 'faust-result__body' },
              e('div', { className: 'faust-prose' }, aiSuggestion.revised)
            ),
            e('div', { className: 'faust-result__actions' },
              e('button', {
                className: 'faust-btn faust-btn--quiet',
                onClick: () => setAiSuggestion(null)
              }, 'Hylkää'),
              e('button', {
                className: 'faust-btn faust-btn--primary',
                // The shorter path for a small change is one modifier away (reconcile R-1)
                title: 'Korvaa valinnan tällä ehdotuksella. Lyhyeen muutokseen riittää Pikamuokkaus (' + shortcut('CmdOrCtrl+K') + ').',
                onClick: applyAiSuggestion
              }, 'Korvaa valittu teksti')
            )
          ) : null,

          // Input area: one composer, as the keskustelu's (V 0.1 rule 7): the field takes the line and
          // dictation and Lähetä stand at its right end; the hint line is under it
          e('div', { key: 'input', className: 'faust-panel__foot' },
            e('div', { className: 'faust-composer' },
            e('input', {
              className: 'faust-input',
              type: 'text',
              value: aiChatInput,
              onChange: (ev) => setAiChatInput(ev.target.value),
              onKeyDown: (ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                  ev.preventDefault();
                  sendAiAssistantMessage();
                }
              },
              placeholder: textSelection && !chapterNoAI ? 'Kerro, miten valittua tekstiä muutetaan…' : 'Kirjoita viesti…',
              disabled: aiChatProcessing
            }),
              // Pressed while it listens, the button stops listening (V 4.1). A stopped recognition may
              // never answer, so the button goes back to rest at once; a late answer still fills the field.
              voiceInputAvailable ? e(VoiceButton, {
                className: 'faust-btn--lg',
                state: aiChatVoiceState,
                label: aiChatVoiceState === 'listening' ? 'Kuunnellaan – puhu nyt' : 'Sanele viesti',
                // While the text's voice edit listens, the shared input is its own: this button waits (B.8 reason)
                title: voiceState === 'listening' ? 'Lopeta ensin valinnan muokkaus puhumalla' : undefined,
                disabled: aiChatVoiceState === 'error' || voiceState === 'listening',
                onToggle: aiChatVoiceState === 'listening'
                  ? () => { if (voiceInputRef.current) voiceInputRef.current.stop(); setAiChatVoiceState('idle'); }
                  : handleAiAssistantVoice
              }) : null,
              e('button', {
                className: 'faust-btn faust-btn--primary faust-btn--lg',
                onClick: sendAiAssistantMessage,
                disabled: aiChatProcessing || !aiChatInput.trim(),
                'aria-busy': aiChatProcessing,
                // A disabled control's tooltip gives the reason (M B.8); while it sends, the busy look says it
                title: !aiChatProcessing && !aiChatInput.trim() ? 'Kirjoita ensin viesti' : 'Lähetä (Enter)'
              },
                aiChatProcessing ? e('span', { className: 'faust-spinner faust-spinner--sm' }) : null,
                aiChatProcessing ? 'Lähetetään…' : 'Lähetä'
              )
            ),
            e('div', { className: 'faust-meta', style: { marginTop: 'var(--sp-2)' } },
              shortcut('CmdOrCtrl+Shift+K') + ' tai Esc kätkee paneelin · Enter lähettää')
          )
        ]
      ))),

      // Kielen työkalut (stage I-06, R-42): the third panel of the right column. Always mounted, so a
      // Kielenhuolto run goes on while it is closed; a new project remounts it (key: the project epoch)
      e('aside', { className: 'faust-aipanel faust-langpanel', 'data-state': languagePanel ? 'open' : 'closed', 'aria-label': 'Kielen työkalut' },
        e(ErrorBoundary, { label: 'Kielen työkalut', onDismiss: closeLanguagePanel },
          e(LanguagePanel, {
            key: projectEpoch,
            mode: languagePanel,
            onMode: setLanguagePanel,
            onClose: closeLanguagePanel,
            project,
            chapter: activeChapter,
            text: (activeChapter && activeChapter.content) || '',
            editorRef,
            onSelectChapter: setActiveChapterId,
            updateProject: (fn) => { setProject(fn); setUnsavedChanges(true); },
            controller: suggestionsRef.current,
            barInfo: suggestionInfo,
            aiClient: getAIClient(),
            aiConfig: aiSource,
            contextSession: getContextSession(),
            textDeps,
            wordCheck: wordCheckRef.current,
            api: window.electronAPI || null,
            aiDisabled,
            onOpenAISettings: openAISettings
          })))
    ),

    // Footer / Status bar
    e('div', { className: 'faust-footer faust-statusbar' },
      e('span', { className: 'faust-statusbar__start' }, (activeChapter && activeChapter.title) || 'Nimetön luku'),
      (() => {
        // One readout: the number in <b>, the noun beside it; the gap separates readouts (no separator characters)
        const stat = (n, word) => {
          const [num, noun] = countParts(n, word);
          return e('span', { className: 'faust-stat' }, e('b', null, num), ' ', noun);
        };
        const [totalNum, totalNoun] = countParts(totalWords, 'sana');
        const [pageNum, pageNoun] = countParts(estimatePages(totalWords), 'sivu');
        // The save state has a fixed slot, so the row never jumps
        const saveKey = savingState !== 'idle' ? savingState : unsavedChanges ? 'unsaved' : undefined;
        const saveWord = { saving: 'Tallennetaan…', saved: 'Tallennettu', error: 'Tallennus epäonnistui', unsaved: 'Muokattu' }[saveKey] || '';
        return e('div', {
          className: 'faust-statusbar__end',
          title: 'Merkkejä ilman välilyöntejä: ' + chapterCharacters.withoutSpaces.toLocaleString('fi-FI') + '. Sivuarvio: 250 sanaa sivulla.'
        },
          stat(chapterWords, 'sana'),
          stat(chapterCharacters.withSpaces, 'merkki'),
          e('span', { className: 'faust-stat' }, 'yhteensä ', e('b', null, totalNum), ' ' + totalNoun + ', noin ', e('b', null, pageNum), ' ' + pageNoun),
          e('span', { className: 'faust-stat', 'data-priority': '3' },
            currentFilePath ? currentFilePath.split(/[\\/]/).pop() : 'Ei tallennettu tiedostoon'),
          e('span', {
            className: 'faust-savestate',
            'data-state': saveKey,
            title: saveKey === 'error' ? (autosaveError || undefined) : undefined
          }, saveKey && e('span', { className: 'faust-dot' }), saveWord)
        );
      })()
    ),

    // Cast Planning Dialog
    e(ErrorBoundary, { label: 'Suunnittele hahmot', onDismiss: () => setShowCastPlanDialog(false) }, showCastPlanDialog ? (() => {
      const castPlan = project.castPlan || {};
      const plannedTypes = castPlan.characterTypes || [];
      const castSuggestions = castPlan.suggestedArchetypes || [];
      // Only text reaches the screen: a model answer (or a plan saved earlier) may hold objects here
      const castText = (value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
      const castWarnings = Array.isArray(castPlan.warnings) ? castPlan.warnings.map(castText).filter((w) => w.trim()) : [];
      // R-88 point 4: a type without a suggestion cannot be accepted
      const castPlanIncomplete = castSuggestions.length < plannedTypes.length || castSuggestions.some((s) =>
        !s || (!s.archetypeFamily && !s.functionInStory && !s.flaws && !(Array.isArray(s.examples) && s.examples.length > 0)));
      const castIncompleteText = 'Tekoäly ei antanut ehdotusta kaikille hahmotyypeille. Muokkaa hahmotyyppejä ja pyydä ehdotukset uudelleen.';
      const closeCastPlan = () => {
        setShowCastPlanDialog(false);
        setCastPlanStep(1);
      };
      const sameCastType = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
      const requestCastSuggestions = async () => {
        const types = castTypesDraft.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
        if (types.length === 0) return;

        // Save types to project
        setProject(prev => ({
          ...prev,
          castPlan: {
            ...prev.castPlan,
            characterTypes: types,
            totalCharacters: types.length
          }
        }));

        // Move to step 2 and start the analysis
        setCastPlanStep(2);
        const run = ++castPlanRunRef.current;
        let analysis = null;
        let reason = '';
        try {
          analysis = await analyzeCast(types);
        } catch (error) {
          reason = (error && error.message) || '';
        }

        // M C.10 row 12a: a result of an earlier run, or of a closed dialog, is dropped
        if (run !== castPlanRunRef.current || !castPlanOpenRef.current) return;

        if (analysis) {
          // One suggestion per typed type: same type text, else the same position, else a blank
          const received = Array.isArray(analysis.suggestions) ? analysis.suggestions.filter((s) => s && typeof s === 'object') : [];
          const suggestedArchetypes = types.map((type, idx) => {
            const atPosition = received[idx] && !types.some((other, j) => j !== idx && sameCastType(received[idx].type, other)) ? received[idx] : null;
            const found = received.find((s) => sameCastType(s.type, type)) || atPosition;
            if (!found) return { type, archetypeFamily: '', examples: [], functionInStory: '', flaws: '' };
            return {
              ...found,
              type,
              examples: Array.isArray(found.examples) ? found.examples : (found.examples ? [String(found.examples)] : [])
            };
          });

          setProject(prev => ({
            ...prev,
            castPlan: {
              ...prev.castPlan,
              suggestedArchetypes,
              castDynamics: analysis.dynamics || null,
              warnings: Array.isArray(analysis.warnings) ? analysis.warnings.filter((w) => typeof w === 'string' && w.trim()) : []
            }
          }));

          setCastPlanStep(3); // Move to review step
        } else {
          const why = String(reason).trim().replace(/\.+$/, '') || 'tekoälyn vastausta ei voitu lukea';
          notify('error', 'Hahmotyyppien analyysi epäonnistui: ' + why + '.');
          setCastPlanStep(1); // Back to input; the field keeps its text
        }
      };

      // A step form: a press on the scrim closes nothing; Esc does what Peruuta does (R-69, R-70)
      return e(Dialog, {
        title: 'Suunnittele hahmot',
        // M C.10 row 2's subtitle is a sentence to the author: serif in the sub slot (V 0.1 rule 3)
        sub: e('span', { className: 'faust-dialog__lede' }, 'Kirjoita, millaisia hahmoja tarinassasi on. Tekoäly ehdottaa kullekin arkkityypin ja huomauttaa puutteista.'),
        // The cast flow keeps one frame: Suunnittele hahmot and Uusi hahmo are both sheets (V 4.8: --lg)
        size: 'lg',
        busy: castPlanStep === 2,
        onClose: closeCastPlan,
        footerStart: castPlanStep === 3 ? e('button', { className: 'faust-btn faust-btn--lg', onClick: () => setCastPlanStep(1) },
          icons.arrowLeft({ size: 14 }), 'Muokkaa hahmotyyppejä') : null,
        footer: e(React.Fragment, null,
          e('button', { className: 'faust-btn faust-btn--lg', onClick: closeCastPlan }, 'Peruuta'),
          castPlanStep === 1 ? e('button', {
            className: 'faust-btn faust-btn--lg faust-btn--primary',
            disabled: !castTypesDraft.trim(),
            title: castTypesDraft.trim() ? undefined : 'Kirjoita ensin vähintään yksi hahmotyyppi',
            onClick: requestCastSuggestions
          }, 'Pyydä ehdotukset', icons.arrowRight({ size: 14 })) : null,
          castPlanStep === 3 ? e('button', {
            className: 'faust-btn faust-btn--lg faust-btn--primary',
            disabled: castPlanIncomplete,
            title: castPlanIncomplete ? castIncompleteText : undefined,
            onClick: () => {
              // Mark cast plan as defined
              setProject(prev => ({
                ...prev,
                castPlan: {
                  ...prev.castPlan,
                  defined: true
                }
              }));
              setUnsavedChanges(true);
              closeCastPlan();
            }
          }, 'Hyväksy hahmosuunnitelma') : null
        )
      },
            // Step 1: character types
            castPlanStep === 1 ? e('label', { className: 'faust-field' },
              e('span', { className: 'faust-field__label' }, 'Hahmotyypit, kukin omalle rivilleen'),
              e('textarea', {
                className: 'faust-textarea faust-textarea--author',
                rows: 8,
                value: castTypesDraft,
                onChange: (ev) => setCastTypesDraft(ev.target.value),
                placeholder: 'Esim.\nStoalainen vanhus – viisas mutta etäinen\nNuori idealisti – naiivi mutta intohimoinen\nKorruptoitunut poliitikko – viehättävä mutta ontto'
              })
            ) : null,

            // Step 2: waiting for the analysis
            castPlanStep === 2 ? e('div', { className: 'faust-empty', role: 'status' },
              e('span', { className: 'faust-spinner faust-spinner--lg' }),
              e('div', { className: 'faust-empty__title' }, 'Tekoäly analysoi hahmotyyppejä…'),
              e('div', { className: 'faust-empty__hint' }, 'Tämä voi kestää 10–30 sekuntia.')
            ) : null,

            // Step 3: suggestions
            castPlanStep === 3 ? e('div', null,
              castPlanIncomplete ? e('div', { className: 'faust-callout faust-callout--warning', style: { marginBottom: 'var(--sp-4)' } },
                icons.warning({ size: 16, className: 'faust-callout__icon' }),
                e('div', { className: 'faust-callout__body' }, castIncompleteText)
              ) : null,

              e('div', { className: 'faust-section' },
                e('div', { className: 'faust-section__head' },
                  e('span', { className: 'faust-section__title' }, 'Ehdotetut arkkityypit')
                ),
                e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
                  castSuggestions.map((suggestion, idx) => {
                    const item = suggestion || {};
                    const examples = Array.isArray(item.examples) ? item.examples : [];
                    return e('div', { key: idx, className: 'faust-card' },
                      e('div', { className: 'faust-card__title' }, castText(item.type) || castText(plannedTypes[idx])),
                      castText(item.archetypeFamily) ? e('div', { className: 'faust-ui' }, castText(item.archetypeFamily)) : null,
                      examples.length > 0 ? e('div', { className: 'faust-card__body' }, `Esimerkkejä: ${examples.join(', ')}`) : null,
                      item.functionInStory ? e('div', { className: 'faust-card__body' }, `Rooli tarinassa: ${item.functionInStory}`) : null,
                      item.flaws ? e('div', { className: 'faust-card__body' }, `Heikkoudet: ${item.flaws}`) : null
                    );
                  })
                )
              ),

              castWarnings.length > 0 ? e('div', { className: 'faust-section' },
                e('div', { className: 'faust-section__head' },
                  e('span', { className: 'faust-section__title' }, 'Huomiot')
                ),
                e('ul', { style: { margin: 0, paddingLeft: 'var(--sp-5)' } },
                  castWarnings.map((warning, idx) => e('li', { key: idx }, warning))
                )
              ) : null
            ) : null
      );
    })() : null),

    // Character Builder Dialog
    e(ErrorBoundary, { label: 'Uusi hahmo', onDismiss: () => setShowCharacterBuilder(false) }, showCharacterBuilder ? (() => {
      const archetype = (selectedCharacterType && selectedCharacterType.archetype) || {};
      const archetypeExamples = Array.isArray(archetype.examples) ? archetype.examples : [];
      const builderTypes = (project.castPlan && project.castPlan.characterTypes) || [];
      // M C.10 row 14: six internal steps shown as four
      const stepLine = {
        1: 'Vaihe 1/4: Hahmotyyppi',
        2: 'Vaihe 2/4: Esikuvat',
        3: 'Vaihe 3/4: Kysymykset',
        4: 'Vaihe 3/4: Kysymykset',
        5: 'Vaihe 4/4: Profiili',
        6: 'Vaihe 4/4: Profiili'
      }[characterBuilderStep] || 'Vaihe 1/4: Hahmotyyppi';
      const questionCategory = {
        motivation: 'Motivaatio',
        shadow: 'Varjo',
        relationships: 'Ihmissuhteet',
        voice: 'Ääni',
        arc: 'Kehityskaari'
      };
      const showProfile = characterBuilderStep === 6 && !!characterProfile;
      const upperFirst = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
      const percentOf = (value) => Math.round((Number(value) || 0) * 100);
      const profileSection = (title, ...children) => e('div', { className: 'faust-section' },
        e('div', { className: 'faust-section__head' }, e('span', { className: 'faust-section__title' }, title)),
        ...children
      );
      const profileRow = (name, value) => e('div', { className: 'faust-kv' }, e('span', null, name), e('span', null, value));
      const profileLine = (name, value) => e('div', null, e('span', { className: 'faust-meta' }, name + ' '), value);

      const psychological = showProfile ? characterProfile.psychological : null;
      const transactional = showProfile ? characterProfile.transactional : null;
      const archetypal = showProfile ? characterProfile.archetypal : null;
      const ensemble = showProfile ? characterProfile.ensemble : null;
      const coreBeliefs = psychological && psychological.beliefSystem && Array.isArray(psychological.beliefSystem.core_beliefs)
        ? psychological.beliefSystem.core_beliefs : [];
      const secondaryArchetypes = archetypal && Array.isArray(archetypal.secondaryArchetypes) ? archetypal.secondaryArchetypes : [];
      const suppressedTraits = archetypal && archetypal.shadowWork && Array.isArray(archetypal.shadowWork.suppressedTraits)
        ? archetypal.shadowWork.suppressedTraits : [];
      const voiceExamples = showProfile && characterProfile.voice && Array.isArray(characterProfile.voice.examples)
        ? characterProfile.voice.examples : [];

      // A step form: a press on the scrim closes nothing; Esc, the close button and Peruuta all ask
      // M D.2 row 16 when something has been entered (cancelCharacterBuilder)
      return e(Dialog, {
        title: 'Uusi hahmo',
        icon: icons.sol({ size: 20 }),
        sub: stepLine,
        size: 'lg',
        // Its steps change the content in place: the panel keeps its top, so title and step line do not jump
        className: 'faust-dialog--steady',
        busy: characterBuilderStep === 3 || characterBuilderStep === 5,
        onClose: () => cancelCharacterBuilder(),
        footerStart: characterBuilderStep === 2 || characterBuilderStep === 4
          ? e('button', {
              className: 'faust-btn faust-btn--lg',
              onClick: () => setCharacterBuilderStep(characterBuilderStep === 2 ? 1 : 2)
            }, icons.arrowLeft({ size: 14 }), 'Takaisin')
          : showProfile
            // BUG-12: going back keeps the generated profile
            ? e('button', { className: 'faust-btn faust-btn--lg', onClick: () => setCharacterBuilderStep(4) },
                icons.arrowLeft({ size: 14 }), 'Muokkaa vastauksia')
            : null,
        footer: e(React.Fragment, null,
          e('button', { className: 'faust-btn faust-btn--lg', onClick: () => cancelCharacterBuilder() }, 'Peruuta'),
          characterBuilderStep === 2 ? e('button', {
            className: 'faust-btn faust-btn--lg faust-btn--primary',
            disabled: !characterRealPeople.trim(),
            // M B.8: a disabled control's tooltip gives the reason of its condition (lead decision 3)
            title: characterRealPeople.trim() ? undefined : 'Kirjoita ensin vähintään yksi esikuva',
            onClick: () => handleCharacterPeopleSubmit()
          }, 'Jatka kysymyksiin', icons.arrowRight({ size: 14 })) : null,
          characterBuilderStep === 4 && characterProfile ? e('button', {
            className: 'faust-btn faust-btn--lg',
            onClick: () => setCharacterBuilderStep(6)
          }, 'Näytä profiili', icons.arrowRight({ size: 14 })) : null,
          characterBuilderStep === 4 ? e('button', {
            className: 'faust-btn faust-btn--lg faust-btn--primary',
            onClick: () => handleCharacterAnswersSubmit()
          }, characterProfile ? 'Luo profiili uudelleen' : 'Luo hahmon profiili', icons.arrowRight({ size: 14 })) : null,
          showProfile ? e('button', {
            className: 'faust-btn faust-btn--lg faust-btn--primary',
            onClick: () => saveCharacterProfile()
          }, 'Tallenna hahmo') : null
        )
      },
            // Step 1: select character type
            characterBuilderStep === 1 ? e('div', null,
              e('div', { className: 'faust-field__label', style: { marginBottom: 'var(--sp-2)' } }, 'Valitse hahmotyyppi, josta luot hahmon'),
              // Each type is a row that moves on, in one framed list: serif name, hover fill and a trailing chevron
              e('div', { className: 'faust-choice-list' },
                builderTypes.map((type, idx) =>
                  e('button', {
                    key: idx,
                    type: 'button',
                    className: 'faust-row faust-row--author faust-row--choice',
                    onClick: () => {
                      // `← Takaisin` can bring the author back here: another type starts clean, so the
                      // previous type's names, questions, answers and kept profile never carry over
                      if (!selectedCharacterType || selectedCharacterType.type !== type) {
                        setCharacterRealPeople('');
                        setCharacterQuestions([]);
                        setCharacterAnswers({});
                        setCharacterProfile(null);
                      }
                      startCharacterBuilder(type);
                    }
                  },
                    e('span', { className: 'faust-row__text' },
                      e('span', { className: 'faust-row__title' }, `${idx + 1}. ${type}`)
                    ),
                    e('span', { className: 'faust-row__icon' }, icons.chevronRight({ size: 14 }))
                  )
                )
              )
            ) : null,

            // Step 2: real people as models
            characterBuilderStep === 2 ? e('div', null,
              e('div', { className: 'faust-card faust-card--compact', style: { marginBottom: 'var(--sp-4)' } },
                e('span', { className: 'faust-meta' }, 'Arkkityyppi'),
                e('span', { className: 'faust-card__title' }, typeof archetype.archetypeFamily === 'string' && archetype.archetypeFamily ? archetype.archetypeFamily : '–'),
                archetypeExamples.length > 0 ? e('span', { className: 'faust-meta' }, `Esimerkkejä: ${archetypeExamples.join(', ')}`) : null
              ),
              e('label', { className: 'faust-field' },
                e('span', { className: 'faust-field__label' }, 'Nimeä todellisia henkilöitä hahmon esikuviksi'),
                e('textarea', {
                  className: 'faust-textarea',
                  rows: 4,
                  value: characterRealPeople,
                  onChange: (ev) => setCharacterRealPeople(ev.target.value),
                  placeholder: 'Esim. Ernst Jünger + C. G. Jung'
                }),
                e('span', { className: 'faust-field__hint' }, 'Kirjoita 1–3 nimeä. Tekoäly yhdistää heidän piirteitään hahmoon. Erota nimet pilkulla tai plusmerkillä.')
              )
            ) : null,

            // Step 3: waiting for the questions
            characterBuilderStep === 3 ? e('div', { className: 'faust-empty', role: 'status' },
              e('span', { className: 'faust-spinner faust-spinner--lg' }),
              e('div', { className: 'faust-empty__title' }, 'Tekoäly laatii tarkentavia kysymyksiä…'),
              e('div', { className: 'faust-empty__hint' }, 'Tämä voi kestää 10–20 sekuntia.')
            ) : null,

            // Step 4: answer the questions
            characterBuilderStep === 4 ? e('div', null,
              e('div', { className: 'faust-field__label', style: { marginBottom: 'var(--sp-3)' } }, `Vastaa tekoälyn kysymyksiin (${characterQuestions.length} kpl)`),
              e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
                characterQuestions.map((q, idx) => {
                  const category = questionCategory[String(q.category || '').trim().toLowerCase()] || q.category || '';
                  return e('div', { key: q.id, className: 'faust-card' },
                    e('label', { className: 'faust-field' },
                      e('span', { className: 'faust-meta' }, category ? `${idx + 1}. ${category}` : `${idx + 1}.`),
                      e('span', { className: 'faust-serif' }, q.question),
                      e('textarea', {
                        className: 'faust-textarea faust-textarea--author',
                        rows: 3,
                        value: characterAnswers[q.id] || '',
                        onChange: (ev) => {
                          setCharacterAnswers(prev => ({
                            ...prev,
                            [q.id]: ev.target.value
                          }));
                        },
                        placeholder: 'Vastauksesi…'
                      })
                    )
                  );
                })
              )
            ) : null,

            // Step 5: waiting for the profile
            characterBuilderStep === 5 ? e('div', { className: 'faust-empty', role: 'status' },
              e('span', { className: 'faust-spinner faust-spinner--lg' }),
              e('div', { className: 'faust-empty__title' }, 'Tekoäly luo hahmon profiilia…'),
              e('div', { className: 'faust-empty__hint' }, 'Tämä voi kestää 20–40 sekuntia.')
            ) : null,

            // Step 6: review the profile
            showProfile ? e('div', null,
              e('div', { className: 'faust-field__label', style: { marginBottom: 'var(--sp-2)' } }, 'Tarkista hahmon profiili'),

              // Basic info
              e('div', { className: 'faust-card', style: { marginBottom: 'var(--sp-2)' } },
                e('div', { className: 'faust-card__title' }, characterProfile.name || '–'),
                e('div', { className: 'faust-meta' }, `${characterProfile.age || '–'} · ${characterProfile.occupation || '–'}`),
                characterProfile.appearance ? e('div', { className: 'faust-card__body' }, characterProfile.appearance) : null,
                characterProfile.description ? e('div', { className: 'faust-card__body' }, characterProfile.description) : null
              ),

              // Layer 1: psychological
              psychological ? profileSection('Persoonallisuus',
                psychological.bigFive ? e('div', { style: { marginBottom: 'var(--sp-3)' } },
                  e('div', { className: 'faust-field__label', style: { marginBottom: 'var(--sp-1)' } }, 'Persoonallisuuspiirteet (Big Five)'),
                  ...Object.entries(psychological.bigFive).map(([trait, value]) =>
                    e('div', { key: trait, style: { marginBottom: 'var(--sp-1)' } },
                      profileRow(labelOf('bigFive', trait), percentOf(value) + ' %'),
                      e('div', { className: 'faust-progress', style: { '--value': percentOf(value) + '%' }, 'aria-hidden': 'true' }, e('i'))
                    )
                  )
                ) : null,
                psychological.dsmCategory && psychological.dsmCategory !== 'none'
                  ? profileRow('Psyykkinen oireilu', label(psychological.dsmCategory)) : null,
                psychological.existentialTerror && psychological.existentialTerror.copingMechanism
                  ? profileRow('Selviytymiskeino', label(psychological.existentialTerror.copingMechanism)) : null,
                psychological.trauma
                  ? profileRow('Trauma', `${psychological.trauma.type ? label(psychological.trauma.type) : '–'} (vakavuus: ${percentOf(psychological.trauma.severity)} %)`) : null,
                psychological.beliefSystem ? e('div', { style: { marginTop: 'var(--sp-2)' } },
                  profileLine('Ydinuskomukset:', coreBeliefs.length > 0 ? coreBeliefs.join(' · ') : '–'),
                  psychological.beliefSystem.worldview ? profileLine('Maailmankuva:', label(psychological.beliefSystem.worldview)) : null
                ) : null
              ) : null,

              // Layer 2: transactional
              transactional ? profileSection('Vuorovaikutus',
                transactional.egoStates ? e('div', { style: { marginBottom: 'var(--sp-3)' } },
                  e('div', { className: 'faust-field__label', style: { marginBottom: 'var(--sp-1)' } }, 'Minätilat:'),
                  e('div', { style: { display: 'flex', gap: 'var(--sp-2)' } },
                    ['parent', 'adult', 'child'].map(state => {
                      const value = transactional.egoStates[state];
                      const isDominant = transactional.dominantState === state;
                      return e('div', {
                        key: state,
                        className: 'faust-card faust-card--compact' + (isDominant ? ' is-selected' : ''),
                        style: { flex: 1, alignItems: 'center' }
                      },
                        e('span', { className: 'faust-meta' }, upperFirst(label(state))),
                        e('span', { className: 'faust-stat faust-stat--hero' }, e('b', null, String(percentOf(value))), ' %')
                      );
                    })
                  )
                ) : null,
                transactional.socialGame && transactional.socialGame.game && transactional.socialGame.game !== 'none'
                  ? profileRow('Draamakolmio', label(transactional.socialGame.game)) : null,
                transactional.communicationStyle
                  ? profileRow('Viestintätyyli', label(transactional.communicationStyle)) : null
              ) : null,

              // Layer 3: archetypal
              archetypal ? profileSection('Arkkityyppi',
                e('div', { className: 'faust-card faust-card--compact', style: { marginBottom: 'var(--sp-3)' } },
                  e('span', { className: 'faust-card__title' }, archetypal.primaryArchetype ? upperFirst(label(archetypal.primaryArchetype)) : '–'),
                  secondaryArchetypes.length > 0
                    ? e('span', { className: 'faust-meta' }, `Toissijaiset: ${secondaryArchetypes.map((a) => label(a)).join(', ')}`) : null
                ),
                archetypal.mythicJourney ? e('div', { style: { marginBottom: 'var(--sp-3)' } },
                  e('div', { style: { marginBottom: 'var(--sp-1)' } },
                    profileLine('Sankarin matka:', archetypal.mythicJourney.stage ? label(archetypal.mythicJourney.stage) : '–')
                  ),
                  e('div', { className: 'faust-progress', style: { '--value': percentOf(archetypal.mythicJourney.completion) + '%' }, 'aria-hidden': 'true' }, e('i'))
                ) : null,
                suppressedTraits.length > 0 ? e('div', null,
                  e('div', { className: 'faust-field__label', style: { marginBottom: 'var(--sp-1)' } }, 'Varjo'),
                  profileLine('Tukahdutetut piirteet:', suppressedTraits.join(', '))
                ) : null
              ) : null,

              // Layer 4: roles (the Theme Fit and Genre Fit placeholders are gone, M C.10 row 33)
              ensemble ? profileSection('Roolit',
                ensemble.storyFit
                  ? profileLine('Rooli tarinassa:', ensemble.storyFit.narrativeRole ? label(ensemble.storyFit.narrativeRole) : '–') : null,
                ensemble.groupDynamics
                  ? profileLine('Rooli ryhmässä:', ensemble.groupDynamics.roleInGroup ? label(ensemble.groupDynamics.roleInGroup) : '–') : null
              ) : null,

              // Legacy fields: MBTI and enneagram, voice samples
              characterProfile.psychology || voiceExamples.length > 0 ? e('div', { className: 'faust-section' },
                characterProfile.psychology ? e('div', { style: { marginBottom: 'var(--sp-2)' } },
                  profileLine('MBTI ja enneagrammi:', [characterProfile.psychology.mbti, characterProfile.psychology.enneagram].filter(Boolean).join(' · ') || '–')
                ) : null,
                voiceExamples.length > 0 ? e('div', null,
                  e('div', { className: 'faust-field__label', style: { marginBottom: 'var(--sp-1)' } }, 'Puhetyyli:'),
                  ...voiceExamples.map((example, idx) =>
                    e('div', { key: idx, className: 'faust-quote' }, `”${example}”`)
                  )
                ) : null
              ) : null
            ) : null
      );
    })() : null),

    // The four dialogs below used to be children of the AI assistant panel,
    // so they only opened while that panel was open. They belong to the window.
    // Regenerate Dialog (Kirjoita luku uudelleen). A form: a press on the scrim does not close it.
    // Busy while the rewrite runs (V 4.8): the instruction and the työtapa are locked, because the
    // running request has already taken both; Peruuta and the close button stay.
    e(ErrorBoundary, { label: 'Kirjoita luku uudelleen', onDismiss: () => setShowRegenerateDialog(false) }, showRegenerateDialog && e(Dialog, {
      title: 'Kirjoita luku uudelleen – ' + ((activeChapter && activeChapter.title) || 'Nimetön luku'),
      size: 'lg',
      busy: isGenerating,
      // Esc, the close button and Peruuta: the dialog closes and the instruction is cleared
      onClose: () => {
        setShowRegenerateDialog(false);
        setRegenerateFeedback('');
      },
      footerStart: e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--lg',
        onClick: () => {
          setShowRegenerateDialog(false);
          setShowVersionHistory(true);
        }
      }, 'Luvun versiot'),
      footer: e(React.Fragment, null,
        e('button', {
          type: 'button',
          className: 'faust-btn faust-btn--lg',
          onClick: () => {
            setShowRegenerateDialog(false);
            setRegenerateFeedback('');
          }
        }, 'Peruuta'),
        e('button', {
          type: 'button',
          className: 'faust-btn faust-btn--lg faust-btn--primary',
          onClick: () => regenerateChapter(),
          // regenerateChapter returns at once while an analysis runs, so the button waits for it too
          disabled: !regenerateFeedback.trim() || isGenerating || !!analysisBusy,
          'aria-busy': isGenerating,
          title: !regenerateFeedback.trim() ? 'Kirjoita ensin, mitä haluat muuttaa' : undefined
        },
          isGenerating ? e('span', { className: 'faust-spinner faust-spinner--sm', 'aria-hidden': 'true' }) : null,
          isGenerating ? 'Kirjoitetaan…' : 'Kirjoita uudelleen'
        )
      )
    },
          // The text is replaced: a warning callout (M C.11 row 1; the second line is BUG-18's)
          e('div', { className: 'faust-callout faust-callout--warning', style: { marginBottom: 'var(--sp-4)' } },
            icons.warning({ size: 16, className: 'faust-callout__icon' }),
            e('div', { className: 'faust-callout__body' },
              e('div', null, 'Tekoäly kirjoittaa koko luvun uudelleen ohjeesi mukaan ja korvaa luvun nykyisen tekstin.'),
              e('div', null, 'Nykyinen teksti tallennetaan ensin luvun versioksi.')
            )
          ),

          // Instruction
          e('label', { className: 'faust-field' },
            e('span', { className: 'faust-field__label' }, 'Ohje tekoälylle'),
            e('textarea', {
              className: 'faust-textarea faust-textarea--author',
              value: regenerateFeedback,
              onChange: (ev) => setRegenerateFeedback(ev.target.value),
              disabled: isGenerating,
              placeholder: 'Esim. ”Tee tästä dramaattisempi”, ”Lisää dialogia”, ”Pidennä jännitystä”',
              'data-autofocus': 'true'
            }),
            e('span', { className: 'faust-field__hint' }, 'Kerro, mitä haluat muuttaa.')
          ),

          // Työtapa: the one setting of the project (BUG-5), the same as on the Tekoäly tab
          e('div', { className: 'faust-field' },
            e('span', { id: 'regenerate-mode-label', className: 'faust-field__label' }, 'Tekoälyn työtapa'),
            e('div', { className: 'faust-segmented faust-segmented--block', role: 'group', 'aria-labelledby': 'regenerate-mode-label' },
              ['exploration', 'production', 'polish'].map(mode =>
                e('button', {
                  key: mode,
                  type: 'button',
                  className: 'faust-segmented__option',
                  'aria-pressed': ((project.ai && project.ai.currentMode) || 'production') === mode,
                  disabled: isGenerating,
                  title: {
                    exploration: 'Ideointi: tekoäly kokeilee rohkeasti ja tarjoaa vaihtoehtoja',
                    production: 'Kirjoitus: tekoäly seuraa suunnitelmaa ja tarinan linjaa',
                    polish: 'Viimeistely: tekoäly hioo kieltä ja tyyliä ja muuttaa sisältöä vain vähän'
                  }[mode],
                  onClick: () => setAIMode(mode)
                }, labelOf('mode', mode))
              )
            )
          )
    )),

    // Version History Dialog (Luvun versiot). Shows things: a press on the scrim closes it.
    e(ErrorBoundary, { label: 'Luvun versiot', onDismiss: () => setShowVersionHistory(false) }, showVersionHistory && (() => {
      const chapterName = (activeChapter && activeChapter.title) || 'Nimetön luku';
      const currentId = activeChapter && activeChapter.currentVersion;
      // Newest first, as on the Luku tab; a copy, so the stored order stays
      const versionList = ((activeChapter && activeChapter.versions) || []).slice().reverse();
      // 'v2' is shown as 2
      const versionNo = (id) => String(id || '').replace(/\D/g, '') || String(id || '');
      const stampOf = (iso) => {
        const d = new Date(iso);
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fi-FI') + ' klo ' + d.toLocaleTimeString('fi-FI', { hour: 'numeric', minute: '2-digit' });
      };
      // One origin line (M C.8 row 4). The first version is stored with mode 'manual' and the
      // feedback 'Original draft', so the mode is tested first.
      // The author's own instruction is quoted in the author's face (V 0.1 rule 3)
      const originOf = (from) => {
        if (!from) return null;
        if (from.mode === 'manual') return 'Oma teksti';
        if (from.userFeedback && String(from.userFeedback).trim()) {
          return [e('span', { key: 'l' }, 'Kirjoitettu uudelleen ohjeella: '), e('span', { key: 'q', className: 'faust-quote' }, '”' + from.userFeedback + '”')];
        }
        return 'Tekoälyn kirjoittama' + (from.mode ? ' · työtapa: ' + labelOf('mode', from.mode).toLowerCase() : '');
      };
      // The current version: the one the chapter names, or else the newest whose text is the chapter's text now
      const textNow = activeChapter ? chapterText(activeChapter) : '';
      const currentKey = versionList.some(version => version.id === currentId)
        ? currentId
        : (versionList.find(version => typeof version.content === 'string' && version.content === textNow) || {}).id;
      const restoreFromList = async (version) => {
        const n = versionNo(version.id);
        if (!(await askConfirm(
          'Palautetaanko versio ' + n + '?',
          'Luvun ”' + chapterName + '” nykyinen teksti korvataan versiolla ' + n + '.',
          'Palauta versio',
          'Peruuta',
          { danger: true }
        ))) return;
        restoreVersion(version.id);
        setShowVersionHistory(false);
      };
      const editComment = async (version) => {
        const text = await askText('Oma kommentti versiosta (valinnainen)', version.userFeedback || '', '', 'Tallenna kommentti');
        if (text === null) return;
        rateVersion(version.id, version.userRating, text || null);
      };

      return e(Dialog, {
        title: 'Luvun versiot – ' + chapterName,
        size: 'lg',
        dismissOnScrim: true,
        // A view: the header's close button (Sulje (Esc)) is its one close control, and it has no footer
        // (R-69, menu-visual entry 88), as Aikajana and the list windows
        onClose: () => setShowVersionHistory(false)
      },
            versionList.length > 0 ?
              e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
                versionList.map(version => {
                  const isCurrent = !!currentKey && version.id === currentKey;
                  const n = versionNo(version.id);
                  const origin = originOf(version.generatedFrom);
                  const words = versionWords(version);

                  // The current version is a plain card: its Nykyinen chip says it (the selected state is for a choice)
                  return e('div', {
                    key: version.id,
                    className: 'faust-card',
                    'aria-current': isCurrent ? 'true' : undefined
                  },
                    e('div', { className: 'faust-card__head' },
                      e('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', minWidth: 0 } },
                        e('span', { className: 'faust-card__title' }, 'Versio ' + n),
                        isCurrent ? e('span', { className: 'faust-chip faust-chip--accent' }, 'Nykyinen') : null
                      ),
                      e('span', { className: 'faust-meta faust-num' }, stampOf(version.timestamp))
                    ),

                    origin ? e('div', { className: 'faust-meta faust-clamp-2', title: typeof origin === 'string' ? origin : 'Kirjoitettu uudelleen ohjeella: ”' + version.generatedFrom.userFeedback + '”' }, origin) : null,
                    e('div', { className: 'faust-meta faust-num' }, count(words, 'sana')),

                    // Oma arvio: five stars (Rating); each keeps the version's comment (W17)
                    e('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-2)' } },
                      e('span', { className: 'faust-meta' }, 'Oma arvio:'),
                      e(Rating, {
                        label: 'Oma arvio',
                        value: version.userRating || 0,
                        onChange: (star) => rateVersion(version.id, star, version.userFeedback || null)
                      })
                    ),

                    // The comment, then its command: M's text link (C.11 row 14), underlined so it reads as a control;
                    // Muokkaa kommenttia… after the comment it edits, Lisää kommentti… alone on the content edge
                    e('div', { style: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 'var(--sp-2)' } },
                      version.userFeedback ? e('div', { style: { minWidth: 0 } },
                        e('span', { className: 'faust-meta' }, 'Oma kommentti: '),
                        e('span', { className: 'faust-quote' }, '”' + version.userFeedback + '”')) : null,
                      e('button', {
                        type: 'button',
                        className: 'faust-link',
                        onClick: () => editComment(version)
                      }, version.userFeedback ? 'Muokkaa kommenttia…' : 'Lisää kommentti…')
                    ),

                    !isCurrent ? e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginTop: 'var(--sp-1)' } },
                      e('button', {
                        type: 'button',
                        className: 'faust-btn faust-btn--sm',
                        onClick: () => restoreFromList(version)
                      }, 'Palauta tämä versio…'),
                      // W7: the list stays open under the comparison
                      e('button', {
                        type: 'button',
                        className: 'faust-btn faust-btn--sm',
                        title: 'Näytä erot tämän version ja luvun nykyisen tekstin välillä',
                        onClick: () => {
                          setComparisonVersionId(version.id);
                          setShowVersionComparison(true);
                        }
                      }, 'Vertaa nykyiseen')
                    ) : null
                  );
                })
              ) :
              e('div', { className: 'faust-empty' },
                e('div', { className: 'faust-empty__title' }, 'Ei vielä versioita.'),
                e('div', { className: 'faust-empty__hint' }, 'Versio tallentuu, kun tekoäly kirjoittaa luvun tai kirjoittaa sen uudelleen.')
              )
      );
    })()),

    // Project Settings Dialog. The fields apply as typed; a press on the scrim does not close it.
    e(ErrorBoundary, { label: 'Projektin asetukset', onDismiss: () => setShowProjectSettings(false) }, showProjectSettings && e(Dialog, {
      title: 'Projektin asetukset',
      size: 'md',
      onClose: () => setShowProjectSettings(false),
      // One button: the fields already apply; saving stays with Tallenna and the menu
      footerStart: e('span', { className: 'faust-meta' },
        'Muutokset tulevat voimaan heti. Tallenna projekti tavalliseen tapaan (' + shortcut('CmdOrCtrl+S') + ').'
      ),
      footer: e('button', {
        type: 'button',
        className: 'faust-btn faust-btn--lg faust-btn--primary',
        onClick: () => setShowProjectSettings(false)
      }, 'Valmis')
    },
          // Title
          e('label', { className: 'faust-field' },
            e('span', { className: 'faust-field__label' }, 'Projektin nimi'),
            e('input', {
              id: 'project-title',
              name: 'projectTitle',
              type: 'text',
              className: 'faust-input faust-input--author',
              value: project.title,
              onChange: (ev) => {
                setProject(prev => ({ ...prev, title: ev.target.value }));
                setUnsavedChanges(true);
              }
            })
          ),

          // Author
          e('label', { className: 'faust-field' },
            e('span', { className: 'faust-field__label' }, 'Kirjoittaja'),
            e('input', {
              id: 'project-author',
              name: 'projectAuthor',
              type: 'text',
              className: 'faust-input faust-input--author',
              value: project.author || '',
              onChange: (ev) => {
                setProject(prev => ({ ...prev, author: ev.target.value }));
                setUnsavedChanges(true);
              }
            })
          ),

          // Genre: stored keys, shown through the display map
          e('label', { className: 'faust-field' },
            e('span', { className: 'faust-field__label' }, 'Genre'),
            e('select', {
              id: 'project-genre',
              name: 'projectGenre',
              className: 'faust-select',
              value: project.genre || 'fiction',
              onChange: (ev) => {
                setProject(prev => ({ ...prev, genre: ev.target.value }));
                setUnsavedChanges(true);
              }
            },
              ['fiction', 'fantasy', 'scifi', 'mystery', 'thriller', 'romance', 'horror', 'literary', 'nonfiction'].map(genre =>
                e('option', { key: genre, value: genre }, labelOf('genre', genre))
              )
            )
          ),

          // Word goal of the manuscript (W19). Stored only when it is at least 1: the sidebar and
          // the Projekti tab divide by it. The field is not controlled, so it can be emptied while typing.
          e('label', { className: 'faust-field' },
            e('span', { className: 'faust-field__label' }, 'Käsikirjoituksen tavoite (sanaa)'),
            // The number in fi-FI form (80 000, M B.13): a text field that reads the digits and ignores the
            // spaces; the arrow keys step by 1 000 as the number field did. A value under 1 is not stored.
            (() => {
              const shown = (n) => (n >= 1 ? Number(n).toLocaleString('fi-FI') : '');
              const digits = (text) => parseInt(String(text).replace(/\D/g, ''), 10);
              const store = (words) => {
                setProject(prev => ({ ...prev, targets: { ...(prev.targets || {}), totalWords: words } }));
                setUnsavedChanges(true);
              };
              return e('input', {
                id: 'project-target-wordcount',
                name: 'projectTargetWordCount',
                type: 'text',
                inputMode: 'numeric',
                className: 'faust-input faust-num',
                defaultValue: shown((project.targets && project.targets.totalWords) || 0),
                onChange: (ev) => {
                  const words = digits(ev.target.value);
                  if (words >= 1) store(words);
                },
                onKeyDown: (ev) => {
                  if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
                  ev.preventDefault();
                  const now = digits(ev.target.value) || 0;
                  const next = Math.max(1000, (Math.floor(now / 1000) + (ev.key === 'ArrowUp' ? 1 : (now % 1000 ? 0 : -1))) * 1000);
                  ev.target.value = shown(next);
                  store(next);
                },
                onBlur: (ev) => {
                  const words = digits(ev.target.value);
                  ev.target.value = shown(words >= 1 ? words : ((project.targets && project.targets.totalWords) || 0));
                }
              });
            })()
          ),

          // Language
          e('label', { className: 'faust-field' },
            e('span', { className: 'faust-field__label' }, 'Käsikirjoituksen kieli'),
            e('select', {
              id: 'project-language',
              name: 'projectLanguage',
              className: 'faust-select',
              value: project.language || 'fi',
              onChange: (ev) => {
                setProject(prev => ({ ...prev, language: ev.target.value }));
                setUnsavedChanges(true);
              }
            },
              e('option', { value: 'fi' }, 'Suomi'),
              e('option', { value: 'en' }, 'Englanti')
            ),
            e('span', { className: 'faust-field__hint' }, 'Tekoäly kirjoittaa ja vastaa tällä kielellä. Älykäs kirjoitus ja typografian tarkistus toimivat vain suomenkielisessä projektissa. Ei vaikuta oikolukuun.')
          ),

          // Rivin alun viiva (I-06): how existing "- " lines are read by the checker and by Kielenhuolto
          e(LineStartDashSelect, {
            project,
            onChange: (value) => {
              setProject(prev => ({ ...prev, typography: { ...(prev.typography || {}), lineStartDash: value } }));
              setUnsavedChanges(true);
            }
          }),

          // Ohjeet tekoälylle: Käsikirjoituksen ydin, Tyyliohje and Vältettävät sanat (I-07)
          e(BookBriefFields, { project, activeChapter, onChange: patchProject, showAvoidWords: true }),
          // Tekoälyn käyttö: the usage log and its export, also with "Tekoäly pois" (MF-64)
          e(AiUsageLogSection, { log: project.aiLog, projectTitle: project.title, chapters: project.structure })
    )),

    // Version Comparison Dialog. It opens over Luvun versiot, which stays open under it (W7).
    e(ErrorBoundary, { label: 'Versioiden vertailu', onDismiss: () => setShowVersionComparison(false) }, showVersionComparison && comparisonVersionId && (() => {
      const compVersion = ((activeChapter && activeChapter.versions) || []).find(v => v.id === comparisonVersionId);
      const compContent = (compVersion && compVersion.content) || '';
      const currentContent = (activeChapter && activeChapter.content) || '';
      // The heads count as Luvun versiot does (one count with the list); the line under the title
      // counts the words of the comparison, so Lisätty minus Poistettu is its Sanamäärä
      const currentWords = currentContent.split(/\s+/).filter(Boolean).length;
      const compWords = versionWords(compVersion || { content: compContent });
      const chapterName = (activeChapter && activeChapter.title) || 'Nimetön luku';
      const compNo = String(comparisonVersionId).replace(/\D/g, '') || String(comparisonVersionId);
      const compDate = compVersion ? new Date(compVersion.timestamp) : null;
      const compStamp = compDate && !isNaN(compDate.getTime())
        ? compDate.toLocaleDateString('fi-FI') + ' klo ' + compDate.toLocaleTimeString('fi-FI', { hour: 'numeric', minute: '2-digit' })
        : '';
      const restoreCompared = async () => {
        if (!(await askConfirm(
          'Palautetaanko versio ' + compNo + '?',
          'Luvun ”' + chapterName + '” nykyinen teksti korvataan versiolla ' + compNo + '.',
          'Palauta versio',
          'Peruuta',
          { danger: true }
        ))) return;
        restoreVersion(comparisonVersionId);
        setShowVersionComparison(false);
        setShowVersionHistory(false);
      };

      // Opened over Luvun versiot, it is the later dialog and stands above it (the stack's order)
      return e(Dialog, {
        title: 'Versioiden vertailu – ' + chapterName,
        // Lisätty 12 · Poistettu 5 · Sanamäärä +7 (M C.11 row 25, BUG-20)
        sub: diffCounts(changeStats(compContent, currentContent)),
        size: 'xl',
        // Two columns of the word comparison (R-20): the version with its deletions, the text with its insertions
        bodyMode: 'flush',
        dismissOnScrim: true,
        onClose: () => setShowVersionComparison(false),
        footer: e(React.Fragment, null,
          e('button', {
            type: 'button',
            className: 'faust-btn faust-btn--lg',
            title: 'Sulje (Esc)',
            onClick: () => setShowVersionComparison(false)
          }, 'Sulje'),
          e('button', {
            type: 'button',
            className: 'faust-btn faust-btn--lg faust-btn--primary',
            // Restoring a version that is the chapter's text now would change nothing (B.8 reason)
            disabled: !compVersion || compContent === currentContent,
            title: compVersion && compContent === currentContent ? 'Versiossa on sama teksti kuin luvussa nyt' : undefined,
            onClick: restoreCompared
          }, 'Palauta tämä versio…')
        )
      },
            // The legend, in the marks' own two looks (M C.11 row 28)
            e('div', { className: 'faust-meta faust-diff__legend' },
              e('ins', { className: 'faust-mark faust-mark--ins' }, 'Vihreä'), ': on nykyisessä tekstissä, mutta ei versiossa ' + compNo + '. ',
              e('del', { className: 'faust-mark faust-mark--del' }, 'Punainen yliviivattu'), ': on versiossa ' + compNo + ', mutta ei nykyisessä tekstissä.'),
            e(DiffView, {
              mode: 'split',
              pieces: computeTextDiff(compContent, currentContent),
              before: e(React.Fragment, null,
                e('span', { className: 'faust-ui' }, 'Versio ' + compNo + (compStamp ? ' · ' + compStamp : '')),
                e('span', { className: 'faust-diff__count' }, compContent ? count(compWords, 'sana') : 'Tyhjä versio')),
              after: e(React.Fragment, null,
                e('span', { className: 'faust-ui' }, 'Nykyinen teksti – erot korostettu'),
                e('span', { className: 'faust-diff__count' }, count(currentWords, 'sana')))
            })
      );
    })()),

    // CharacterSheet Modal (View/Edit Characters)
    e(ErrorBoundary, { label: 'Hahmot', onDismiss: () => setShowCharacterSheet(false) }, showCharacterSheet && (() => {
      const characters = project.characters || [];
      const hasCastPlan = !!(project.castPlan && project.castPlan.defined);
      const isProfile = characterSheetMode === 'view' && !!selectedCharacter;
      const nameOf = (char) => (char && ((char.basicInfo && char.basicInfo.name) || char.name)) || 'Nimetön hahmo';
      const archetypeOf = (char) => (char.archetypal && char.archetypal.primaryArchetype) ||
        (char.archetype && (char.archetype.archetypeFamily || char.archetype.primaryArchetype)) || '';
      const closeCharacterSheet = () => {
        setShowCharacterSheet(false);
        setCharacterSheetMode('list');
        setSelectedCharacter(null);
      };
      const showCharacterList = () => {
        setCharacterSheetMode('list');
        setSelectedCharacter(null);
      };
      const deleteCharacter = async (character) => {
        if (!(await askConfirm('Poistetaanko hahmo?', 'Hahmo ”' + nameOf(character) + '” poistetaan. Poistoa ei voi kumota.', 'Poista hahmo', 'Peruuta', { danger: true }))) return;
        setProject(prev => ({
          ...prev,
          characters: (prev.characters || []).filter((c) => (character.id ? c.id !== character.id : c !== character))
        }));
        setUnsavedChanges(true);
        showCharacterList();
      };

      // The profile: one section per layer, key-value rows, stored values through label()
      const isEmpty = (value) => value === undefined || value === null || value === '';
      const percent = (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 100) + ' %' : (isEmpty(value) ? null : String(value)));
      const listOf = (value, toText) => (Array.isArray(value) ? value.filter((v) => !isEmpty(v)).map((v) => (toText ? toText(v) : String(v))).join(', ') : '');
      // A label column and the value beside it (not the narrow panel's flush-right kv); the value is
      // the author's data, in serif (V 0.1 rule 3)
      const kvRow = (key, value) => (isEmpty(value) ? null
        : e('div', { key, className: 'faust-kv faust-kv--profile' }, e('span', null, key + ':'), e('span', null, String(value))));
      const rowGroup = (key, title, rows) => {
        const shown = rows.filter(Boolean);
        if (!shown.length) return null;
        return e('div', { key, style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } },
          title && e('div', { className: 'faust-field__label' }, title),
          e('div', { className: 'faust-kv-list' }, ...shown));
      };
      const textBlock = (key, value) => (isEmpty(value) ? null
        : e('div', { key, style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } },
            e('div', { className: 'faust-field__label' }, key),
            e('div', { className: 'faust-serif', style: { whiteSpace: 'pre-wrap' } }, String(value))));
      const profileSection = (title, items) => {
        const shown = items.filter(Boolean);
        if (!shown.length) return null;
        return e('div', { key: title, className: 'faust-section' },
          e('div', { className: 'faust-section__head' },
            e('div', { className: 'faust-section__title', role: 'heading', 'aria-level': 3 }, title)),
          e('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } }, ...shown));
      };
      const profileSections = (char) => {
        const info = char.basicInfo || {};
        const pick = (field) => info[field] ?? char[field];
        const psych = char.psychological;
        const p = psych && typeof psych === 'object' ? psych : {};
        const beliefs = p.beliefSystem || {};
        const trans = char.transactional || {};
        const arch = char.archetypal || {};
        const ensemble = char.ensemble || {};
        const psychology = char.psychology || {};
        const voice = char.voice || {};
        const voiceLines = (Array.isArray(voice.examples) ? voice.examples : []).filter((line) => !isEmpty(line));
        const archetype = archetypeOf(char);
        return [
          profileSection('Perustiedot', [
            // the name is the dialog's title already
            rowGroup('perustiedot', null, [kvRow('Ikä', pick('age')), kvRow('Ammatti', pick('occupation'))]),
            textBlock('Ulkonäkö', pick('appearance')),
            textBlock('Kuvaus', pick('description')),
            textBlock('Tausta', pick('background'))
          ]),
          typeof psych === 'string' && psych.trim() !== '' && profileSection('Profiili', [
            e('div', { key: 'profiili', className: 'faust-serif', style: { whiteSpace: 'pre-wrap' } }, psych)
          ]),
          profileSection('Persoonallisuus', [
            rowGroup('bigFive', 'Persoonallisuuspiirteet (Big Five)',
              Object.entries(p.bigFive || {}).map(([trait, value]) => kvRow(labelOf('bigFive', trait), percent(value)))),
            rowGroup('psyyke', null, [
              p.dsmCategory && p.dsmCategory !== 'none' ? kvRow('Psyykkinen oireilu', label(p.dsmCategory)) : null,
              p.existentialTerror && p.existentialTerror.copingMechanism ? kvRow('Selviytymiskeino', label(p.existentialTerror.copingMechanism)) : null,
              p.trauma && p.trauma.type ? kvRow('Trauma', label(p.trauma.type) + (typeof p.trauma.severity === 'number' ? ' (vakavuus: ' + percent(p.trauma.severity) + ')' : '')) : null,
              beliefs.worldview ? kvRow('Maailmankuva', label(beliefs.worldview)) : null
            ]),
            textBlock('Ydinuskomukset', Array.isArray(beliefs.core_beliefs) ? beliefs.core_beliefs.filter((b) => !isEmpty(b)).join(' · ') : '')
          ]),
          profileSection('Vuorovaikutus', [
            rowGroup('minatilat', 'Minätilat', trans.egoStates ? [
              kvRow('Vanhempi', percent(trans.egoStates.parent)),
              kvRow('Aikuinen', percent(trans.egoStates.adult)),
              kvRow('Lapsi', percent(trans.egoStates.child))
            ] : []),
            rowGroup('vuorovaikutus', null, [
              trans.socialGame && trans.socialGame.game && trans.socialGame.game !== 'none' ? kvRow('Draamakolmio', label(trans.socialGame.game)) : null,
              trans.communicationStyle ? kvRow('Viestintätyyli', label(trans.communicationStyle)) : null
            ])
          ]),
          profileSection('Arkkityyppi', [
            rowGroup('arkkityyppi', null, [
              archetype ? kvRow('Arkkityyppi', label(archetype)) : null,
              kvRow('Toissijaiset', listOf(arch.secondaryArchetypes, (v) => label(v))),
              arch.mythicJourney && arch.mythicJourney.stage ? kvRow('Sankarin matka', label(arch.mythicJourney.stage)) : null
            ]),
            rowGroup('varjo', 'Varjo', [
              kvRow('Tukahdutetut piirteet', listOf(arch.shadowWork && arch.shadowWork.suppressedTraits))
            ])
          ]),
          profileSection('Roolit', [
            rowGroup('roolit', null, [
              // The list card's Rooli tarinassa (basicInfo.role) when the builder's storyFit is missing: the profile
              // never shows less than the card that opens it
              (ensemble.storyFit && ensemble.storyFit.narrativeRole) || pick('role')
                ? kvRow('Rooli tarinassa', label((ensemble.storyFit && ensemble.storyFit.narrativeRole) || pick('role'))) : null,
              ensemble.groupDynamics && ensemble.groupDynamics.roleInGroup ? kvRow('Rooli ryhmässä', label(ensemble.groupDynamics.roleInGroup)) : null,
              kvRow('MBTI ja enneagrammi', [psychology.mbti, psychology.enneagram].filter((v) => !isEmpty(v)).join(' · '))
            ]),
            (!isEmpty(voice.style) || voiceLines.length > 0) && e('div', { key: 'puhetyyli', style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-1)' } },
              e('div', { className: 'faust-field__label' }, 'Puhetyyli'),
              !isEmpty(voice.style) && e('div', { className: 'faust-serif' }, String(voice.style)),
              ...voiceLines.map((line, i) => e('div', { key: i, className: 'faust-quote' }, '”' + line + '”')))
          ])
        ].filter(Boolean);
      };

      const listBody = characters.length === 0
        ? e('div', { className: 'faust-empty' },
            icons.sol({ size: 40, className: 'faust-empty__icon' }),
            e('div', { className: 'faust-empty__title' }, 'Ei vielä hahmoja.'),
            !aiDisabled && e('div', { className: 'faust-empty__hint' }, hasCastPlan ? 'Luo ensimmäinen valitsemalla + Uusi hahmo…' : 'Aloita valitsemalla Suunnittele hahmot…'))
        : e('div', { className: 'faust-listgrid' },
            characters.map((char, idx) => {
              const role = (char.basicInfo && char.basicInfo.role) || char.role || '';
              const archetype = archetypeOf(char);
              const description = (char.basicInfo && char.basicInfo.description) || char.description || '';
              return e('button', {
                key: idx,
                type: 'button',
                className: 'faust-card faust-card--click',
                onClick: () => {
                  setSelectedCharacter(char);
                  setCharacterSheetMode('view');
                }
              },
                e('span', { className: 'faust-card__title' }, nameOf(char)),
                description && e('span', { className: 'faust-card__body faust-clamp-2' }, String(description)),
                // The facts stand in the card's foot, one per line, so the feet of a row share one edge (V 4.4)
                (role || archetype) && e('span', { className: 'faust-card__foot faust-card__foot--lines' },
                  role && e('span', null, 'Rooli tarinassa: ' + label(role)),
                  archetype && e('span', null, 'Arkkityyppi: ' + label(archetype)))
              );
            }));

      // A list window: a press on the scrim closes it (R-69)
      return e(Dialog, {
        title: isProfile ? nameOf(selectedCharacter) : 'Hahmot',
        icon: icons.sol({ size: 20 }),
        sub: isProfile ? 'Hahmon profiili' : (characters.length > 0 ? count(characters.length, 'hahmo') : null),
        size: 'lg',
        // The list and a profile share the window: it keeps its top, so the title and the close button
        // stay put when a card or ← Kaikki hahmot is pressed
        className: 'faust-dialog--steady',
        dismissOnScrim: true,
        onClose: closeCharacterSheet,
        actions: !isProfile && !aiDisabled && e('button', {
          className: 'faust-btn',
          onClick: () => {
            // The builder opens in place of this window: close this one first
            closeCharacterSheet();
            if (hasCastPlan) openCharacterBuilder();
            else openCastPlan();
          }
        }, hasCastPlan ? '+ Uusi hahmo…' : 'Suunnittele hahmot…'),
        footerStart: isProfile
          ? e('button', { className: 'faust-btn faust-btn--lg faust-btn--danger', onClick: () => deleteCharacter(selectedCharacter) }, 'Poista hahmo')
          : null
      },
        isProfile
          ? e('div', null,
              e('div', { style: { marginBottom: 'var(--sp-4)' } },
                // The quiet button's padding hangs outside the content edge, so its arrow stands on it
                e('button', { className: 'faust-btn faust-btn--quiet faust-btn--flush-start', onClick: showCharacterList },
                  icons.arrowLeft({ size: 14 }), 'Kaikki hahmot')),
              e('div', null, ...profileSections(selectedCharacter)))
          : listBody
      );
    })()),

    // LocationSheet Modal (List View)
    e(ErrorBoundary, { label: 'Paikat', onDismiss: () => setShowLocationSheet(false) }, showLocationSheet && (() => {
      // Keyed by the stored object key: a place without a name has no other unique key
      const locationEntries = Object.entries((project.continuity && project.continuity.locations) || {})
        .filter(([, loc]) => loc && typeof loc === 'object');
      // A list window: a press on the scrim closes it (R-69); the place form opens above it
      return e(Dialog, {
        title: 'Paikat',
        icon: icons.terra({ size: 20 }),
        sub: locationEntries.length > 0 ? count(locationEntries.length, 'paikka') : null,
        size: 'lg',
        dismissOnScrim: true,
        onClose: () => setShowLocationSheet(false),
        actions: e('button', {
          className: 'faust-btn',
          onClick: () => {
            setSelectedLocation(null);
            setLocationFormMode('create');
            setShowLocationFormModal(true);
          }
        }, '+ Uusi paikka…')
      },
            locationEntries.length === 0
              ? e('div', { className: 'faust-empty' },
                  icons.terra({ size: 40, className: 'faust-empty__icon' }),
                  e('div', { className: 'faust-empty__title' }, 'Ei vielä paikkoja.'),
                  e('div', { className: 'faust-empty__hint' }, 'Paikat ovat tarinan tapahtumapaikkoja.'))
              : e('div', { className: 'faust-listgrid' },
                  locationEntries.map(([storedKey, loc]) =>
                    e('button', {
                      key: storedKey,
                      type: 'button',
                      className: 'faust-card faust-card--click',
                      onClick: () => {
                        setSelectedLocation(loc);
                        setLocationFormMode('edit');
                        setShowLocationFormModal(true);
                      }
                    },
                      e('span', { className: 'faust-card__title' }, loc.name || 'Nimetön paikka'),
                      // The author's own description first, as on the thread and character cards
                      loc.description && e('span', { className: 'faust-card__body faust-clamp-2' }, String(loc.description)),
                      // M C.12 row 13's lines, each hidden when its data is missing, in the card's foot
                      (() => {
                        const first = typeof loc.firstMentioned === 'number' && Number.isFinite(loc.firstMentioned);
                        const seen = Array.isArray(loc.appearances) && loc.appearances.length > 0;
                        return (first || seen) && e('span', { className: 'faust-card__foot faust-card__foot--lines' },
                          first && e('span', null, `Ensimmäinen maininta: luku ${loc.firstMentioned + 1}`),
                          seen && e('span', null, `Esiintyy ${loc.appearances.length} luvussa`));
                      })()
                    )
                  )
                )
      );
    })()),

    // LocationSheet Form Modal (Create/Edit/View) - External Component
    e(ErrorBoundary, { label: 'Paikka', onDismiss: () => setShowLocationFormModal(false) }, showLocationFormModal && window.LocationSheetModal && e(window.LocationSheetModal, {
      isOpen: showLocationFormModal,
      onClose: () => {
        setShowLocationFormModal(false);
        setSelectedLocation(null);
      },
      location: selectedLocation,
      locations: Object.values(project.continuity?.locations || {}),
      onSave: handleLocationSave,
      onDelete: deleteLocation,
      mode: locationFormMode
    })),

    // ThreadSheet Modal (Plot Threads List View)
    e(ErrorBoundary, { label: 'Juonilangat', onDismiss: () => setShowThreadSheet(false) }, showThreadSheet && (() => {
      const threads = project.plotThreads || [];
      const threadChip = (status) => (status === 'resolved' ? 'faust-chip faust-chip--success faust-chip--dot'
        : status === 'abandoned' ? 'faust-chip faust-chip--struck' : 'faust-chip faust-chip--hollow');
      // A list window: a press on the scrim closes it (R-69); the thread form opens above it
      return e(Dialog, {
        title: 'Juonilangat',
        icon: icons.lemniscate({ size: 20 }),
        sub: threads.length > 0 ? count(threads.length, 'juonilanka') : null,
        size: 'lg',
        dismissOnScrim: true,
        onClose: () => setShowThreadSheet(false),
        actions: e('button', {
          className: 'faust-btn',
          onClick: () => {
            setSelectedThread(null);
            setThreadFormMode('create');
            setShowThreadFormModal(true);
          }
        }, '+ Uusi juonilanka…')
      },
            threads.length === 0
              ? e('div', { className: 'faust-empty' },
                  icons.lemniscate({ size: 40, className: 'faust-empty__icon' }),
                  e('div', { className: 'faust-empty__title' }, 'Ei vielä juonilankoja.'),
                  e('div', { className: 'faust-empty__hint' }, 'Juonilanka on juoni, jota seurataan luvusta toiseen.'))
              : e('div', { className: 'faust-listgrid' },
                  threads.map((thread, idx) =>
                    e('button', {
                      key: thread.id || idx,
                      type: 'button',
                      // The thread's colour of Aikajana as the card's stripe, so list and timeline match
                      className: 'faust-card faust-card--click faust-card--stripe',
                      style: { '--stripe': THREAD_HUES[idx % THREAD_HUES.length] },
                      onClick: () => {
                        setSelectedThread(thread);
                        setThreadFormMode('edit');
                        setShowThreadFormModal(true);
                      }
                    },
                      e('span', { className: 'faust-card__head' },
                        e('span', { className: 'faust-card__title' }, thread.name || 'Nimetön juonilanka'),
                        thread.status && e('span', { className: threadChip(thread.status) }, labelOf('threadStatus', thread.status))
                      ),
                      thread.description && e('span', { className: 'faust-card__body faust-clamp-2' }, thread.description),
                      thread.type && e('span', { className: 'faust-card__foot faust-card__foot--lines' }, 'Tyyppi: ' + labelOf('threadType', thread.type).toLowerCase())
                    )
                  )
                )
      );
    })()),

    // ThreadSheet Form Modal (Create/Edit/View) - External Component
    e(ErrorBoundary, { label: 'Juonilanka', onDismiss: () => setShowThreadFormModal(false) }, showThreadFormModal && window.ThreadSheetModal && e(window.ThreadSheetModal, {
      isOpen: showThreadFormModal,
      onClose: () => {
        setShowThreadFormModal(false);
        setSelectedThread(null);
      },
      thread: selectedThread,
      threads: project.plotThreads || [],
      onSave: handleThreadSave,
      onDelete: deleteThread,
      mode: threadFormMode
    })),

    // ChapterSheet Modal (Edit Chapter Details)
    e(ErrorBoundary, { label: 'Luvun tiedot', onDismiss: () => setShowChapterSheetModal(false) }, showChapterSheetModal && window.ChapterSheetModal && e(window.ChapterSheetModal, {
      isOpen: showChapterSheetModal,
      chapter: activeChapter,
      mode: 'edit',
      onSave: handleChapterSheetSave,
      onClose: () => setShowChapterSheetModal(false)
    })),

    // Timeline View Modal
    e(ErrorBoundary, { label: 'Aikajana', onDismiss: () => setShowTimelineView(false) }, showTimelineView && (() => {
      const chapters = project.structure || [];
      const threads = project.plotThreads || [];
      const lastIndex = Math.max(chapters.length - 1, 0);
      const threadHues = THREAD_HUES;
      // A chapter position as the bars have always read it (the source of the bars is a later fix), kept inside the strip
      const chapterPosition = (value, fallback) => (
        typeof value === 'number' && Number.isFinite(value)
          ? Math.min(Math.max(Math.round(value), 0), lastIndex)
          : fallback
      );
      const closeTimeline = () => setShowTimelineView(false);

      // A view: a press on the scrim closes it (R-69)
      return e(Dialog, {
        title: 'Aikajana',
        icon: icons.luna({ size: 20 }),
        sub: 'Luvut, tapahtuma-ajat ja juonilangat',
        size: 'xl',
        dismissOnScrim: true,
        onClose: closeTimeline
      },
            chapters.length > 0 ? e('div', { className: 'faust-timeline' },
              // One grid for the chapters and the threads, so a bar starts and ends under its chapters
              e('div', { className: 'faust-timeline__grid', style: { '--n': String(chapters.length) } },
                // The chapter row's label stands in the name column, so the column reads as a header column
                e('div', { className: 'faust-timeline__name faust-timeline__name--head', style: { gridColumn: '1', gridRow: '1' } }, 'Luvut'),

                chapters.map((chapter, idx) => {
                  const words = (chapter.content || '').split(/\s+/).filter(Boolean).length;
                  const status = normStatus(chapter.status);
                  const isActive = chapter.id === activeChapterId;

                  return e('button', {
                    key: chapter.id || idx,
                    type: 'button',
                    className: 'faust-card faust-card--compact faust-card--click' + (isActive ? ' is-selected' : ''),
                    style: { gridColumn: String(idx + 2), gridRow: '1', alignSelf: 'stretch' },
                    title: 'Avaa luku',
                    'aria-current': isActive ? 'true' : undefined,
                    onClick: () => {
                      setActiveChapterId(chapter.id);
                      closeTimeline();
                    }
                  },
                    e('span', { className: 'faust-meta' }, `Luku ${idx + 1}`),
                    // The chapter's title is the author's words: serif, as the thread names beside it. A title that
                    // only repeats the number line (Luku 4) is not shown twice.
                    (chapter.title || '').trim() !== `Luku ${idx + 1}` && e('span', {
                      className: 'faust-card__title faust-card__title--author',
                      style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
                    }, chapter.title || 'Nimetön luku'),
                    e('span', { className: 'faust-meta' }, count(words, 'sana')),
                    // The chip stands at the card's foot (stylesheet), so the chips of the row share one line
                    e('span', { className: 'faust-chip ' + (STATUS_CHIP[status] || 'faust-chip--hollow') }, labelOf('status', status)),
                    chapter.storyTimestamp && e('span', { className: 'faust-meta' }, `Tapahtuma-aika: ${chapter.storyTimestamp}`)
                  );
                }),

                threads.length > 0 && e('div', {
                  className: 'faust-section__title',
                  style: { gridColumn: '1 / -1', marginTop: 'var(--sp-4)' }
                }, 'Juonilangat'),

                threads.map((thread, idx) => {
                  const from = chapterPosition(thread.introduced, 0);
                  const resolvedAt = chapterPosition(thread.resolved, null);
                  const to = resolvedAt === null ? lastIndex : Math.max(resolvedAt, from);
                  const status = thread.status || 'active';
                  const statusChip = status === 'resolved'
                    ? 'faust-chip--success faust-chip--dot'
                    : status === 'abandoned' ? 'faust-chip--struck' : 'faust-chip--hollow';
                  const name = thread.name || 'Nimetön juonilanka';

                  return e(React.Fragment, { key: thread.id || idx },
                    e('div', { className: 'faust-timeline__name', style: { gridColumn: '1' }, title: name }, name),
                    e('div', {
                      className: 'faust-timeline__bar' + (resolvedAt === null ? ' is-open' : ''),
                      style: { '--from': String(from), '--to': String(to), '--thread': threadHues[idx % threadHues.length] }
                    }),
                    e('div', { className: 'faust-timeline__status', style: { gridColumn: '-2 / -1' } },
                      e('span', { className: 'faust-chip ' + statusChip }, labelOf('threadStatus', status))
                    )
                  );
                })
              )
            ) : e('div', { className: 'faust-empty' },
              e('div', { className: 'faust-empty__icon' }, icons.luna({ size: 40 })),
              e('div', { className: 'faust-empty__title' }, 'Ei vielä lukuja.'),
              e('div', { className: 'faust-empty__hint' }, 'Lisää ensimmäinen luku sivupalkista.')
            )
      );
    })()),

    // Research Folder Modal
    e(ErrorBoundary, { label: 'Tutkimuskansio', onDismiss: () => setShowResearchFolder(false) }, showResearchFolder && (() => {
      const items = project.research || [];
      const closeResearch = () => setShowResearchFolder(false);
      const typeIcons = { note: 'note', link: 'link', image: 'file', pdf: 'file' };

      // A link opens only as https: the address is trimmed and gets https:// when no scheme was typed
      const linkAddress = (text) => {
        const raw = String(text || '').trim();
        if (!raw) return '';
        return /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(raw) ? raw : 'https://' + raw;
      };

      const addResearchItem = (fields) => {
        const newItem = { id: `research-${Date.now()}`, ...fields, created: new Date().toISOString() };
        setProject(prev => ({
          ...prev,
          research: [...(prev.research || []), newItem]
        }));
        setUnsavedChanges(true);
      };

      // Peruuta or Esc on any step creates nothing
      const addNote = async () => {
        const title = await askText('Muistiinpanon otsikko', '', '', 'Lisää muistiinpano');
        if (!title || !title.trim()) return;
        addResearchItem({ type: 'note', title: title.trim(), content: '' });
      };

      const addLink = async () => {
        const address = linkAddress(await askText('Linkin osoite', '', '', 'Jatka'));
        if (!address) return;
        const title = await askText('Linkin otsikko (valinnainen)', '', '', 'Lisää linkki');
        if (title === null || title === undefined) return;
        addResearchItem({ type: 'link', title: title.trim() || address, url: address });
      };

      const addFileReference = async () => {
        const title = await askText('Tiedoston kuvaus', '', '', 'Jatka');
        if (!title || !title.trim()) return;
        const path = await askText('Tiedoston polku tai osoite', '', '', 'Lisää tiedostoviite');
        if (!path || !path.trim()) return;
        addResearchItem({ type: 'image', title: title.trim(), path: path.trim() });
      };

      const openLink = async (address) => {
        let opened = false;
        try {
          const result = window.electronAPI && window.electronAPI.openExternal
            ? await window.electronAPI.openExternal(address)
            : null;
          opened = !!(result && result.success);
        } catch (err) {
          console.error('[Research] Opening a link failed:', err);
        }
        if (!opened) notify('error', 'Linkkiä ei voitu avata. FAUST avaa vain https-alkuiset osoitteet.');
      };

      const deleteResearchItem = async (item) => {
        const kind = labelOf('researchType', item.type).toLowerCase();
        if (!(await askConfirm(
          `Poistetaanko ${kind}?`,
          '”' + item.title + '” poistetaan tutkimuskansiosta. Poistoa ei voi kumota.',
          `Poista ${kind}`,
          'Peruuta',
          { danger: true }
        ))) return;
        setProject(prev => ({
          ...prev,
          research: (prev.research || []).filter(r => r.id !== item.id)
        }));
        setUnsavedChanges(true);
      };

      // A view: a press on the scrim closes it (R-69); its notes save as typed
      return e(Dialog, {
        title: 'Tutkimuskansio',
        icon: icons.trigon({ size: 20 }),
        sub: 'Muistiinpanot, linkit ja muu taustamateriaali',
        size: 'lg',
        dismissOnScrim: true,
        // A view opens on its panel, as Hahmot, Paikat, Juonilangat and Aikajana do (V 4.8): its first
        // field belongs to a note
        initialFocus: 'panel',
        onClose: closeResearch
      },
            // The three create actions are the body's toolbar row, so the title and its line keep the
            // header's width
            e('div', { className: 'faust-dialog__toolbar' },
              e('button', { type: 'button', className: 'faust-btn', onClick: addNote }, '+ Muistiinpano…'),
              e('button', { type: 'button', className: 'faust-btn', onClick: addLink }, '+ Linkki…'),
              e('button', {
                type: 'button',
                className: 'faust-btn',
                title: 'Tallenna muistiin, missä taustamateriaali on. Tiedostoa ei kopioida projektiin.',
                onClick: addFileReference
              }, '+ Tiedostoviite…')
            ),
            items.length > 0 ? e('div', { className: 'faust-cardgrid faust-cardgrid--start' },
              items.map((item, idx) => {
                const typeKey = typeIcons[item.type] ? item.type : 'image';
                const address = item.type === 'link' ? linkAddress(item.url) : '';

                return e('div', { key: item.id || idx, className: 'faust-card' },
                  e('div', { className: 'faust-card__head' },
                    e('span', { className: 'faust-chip' },
                      icons[typeIcons[typeKey]]({ size: 12 }),
                      labelOf('researchType', typeKey)
                    ),
                    e('button', {
                      type: 'button',
                      className: 'faust-btn faust-btn--icon faust-btn--sm faust-btn--danger',
                      title: 'Poista',
                      'aria-label': 'Poista',
                      onClick: () => deleteResearchItem(item)
                    }, icons.close({ size: 14 }))
                  ),
                  e('div', { className: 'faust-card__title' }, item.title),

                  item.type === 'note' && e('textarea', {
                    className: 'faust-textarea faust-textarea--author',
                    'aria-label': 'Muistiinpano',
                    value: item.content || '',
                    onChange: (ev) => {
                      setProject(prev => ({
                        ...prev,
                        research: (prev.research || []).map(r =>
                          r.id === item.id ? { ...r, content: ev.target.value } : r
                        )
                      }));
                      setUnsavedChanges(true);
                    },
                    placeholder: 'Kirjoita muistiinpano…'
                  }),
                  // A note into Tarinakansio, as an entry that is never sent until its state is changed (I-07)
                  item.type === 'note' && e(CopyToCodexButton, {
                    item,
                    project,
                    onChange: patchProject,
                    onOpen: (id) => { setShowResearchFolder(false); openCodexEntry(id); }
                  }),

                  address && e('div', { className: 'faust-meta', style: { overflowWrap: 'anywhere' } },
                    e('a', {
                      href: /^https?:\/\//i.test(address) ? address : '#',
                      title: 'Avaa selaimessa',
                      onClick: (ev) => {
                        ev.preventDefault();
                        openLink(address);
                      }
                    }, item.url)
                  ),

                  (item.type === 'image' || item.type === 'pdf') && item.path && e('div', {
                    className: 'faust-meta',
                    style: { overflowWrap: 'anywhere' }
                  }, `Tiedosto: ${item.path}`),

                  item.created && e('div', { className: 'faust-card__foot' }, new Date(item.created).toLocaleDateString('fi-FI'))
                );
              })
            ) : e('div', { className: 'faust-empty' },
              e('div', { className: 'faust-empty__icon' }, icons.trigon({ size: 40 })),
              e('div', { className: 'faust-empty__title' }, 'Ei vielä taustamateriaalia.'),
              e('div', { className: 'faust-empty__hint' }, 'Lisää muistiinpanoja tai linkkejä.')
            )
      );
    })()),

    // Kirjoita tekoälyn kanssa: continue the text, write from a summary, rewrite a selection, write a scene
    e(ErrorBoundary, { label: 'Kirjoita tekoälyn kanssa', onDismiss: () => setShowContinueDialog(false) }, !aiDisabled && !chapterNoAI && showContinueDialog && (() => {
      const chapterHasText = !!(activeChapter && chapterText(activeChapter).trim());
      const hasSelection = !!textSelection?.text;
      const closeWriting = () => {
        setShowContinueDialog(false);
        setContinuePreview('');
        setHybridInput('');
      };
      // One request for the open tab: Luo ehdotus and Luo uusi ehdotus both send it
      const requestSuggestion = () => {
        if (hybridMode === 'continue') handleContinueWriting();
        else if (hybridMode === 'expand') handleExpandOutline();
        else if (hybridMode === 'rewrite') handleRewriteSection();
        else if (hybridMode === 'scene') handleGenerateScene();
      };
      const requestBlocked = continuingWriting ||
        (hybridMode === 'continue' && !chapterHasText) ||
        (hybridMode !== 'continue' && !hybridInput.trim()) ||
        (hybridMode === 'rewrite' && !hasSelection);
      // A disabled Luo ehdotus names the reason of its tab's condition (M B.8, lead decision 3); a busy
      // guard is silent (R-68)
      const blockedReason = continuingWriting
        ? undefined
        : hybridMode === 'continue' && !chapterHasText
          ? 'Luvussa ei ole vielä tekstiä jatkettavaksi'
          : hybridMode === 'rewrite' && !hasSelection
            ? 'Valitse ensin teksti luvusta'
            : hybridMode === 'expand' && !hybridInput.trim()
              ? 'Kirjoita ensin tiivistelmä'
              : hybridMode === 'scene' && !hybridInput.trim()
                ? 'Kuvaile ensin kohtaus'
                : hybridMode === 'rewrite' && !hybridInput.trim()
                  ? 'Kirjoita ensin, mitä haluat muuttaa'
                  : undefined;
      const modeTabs = [
        { mode: 'continue', text: 'Jatka tekstiä', tip: 'Tekoäly jatkaa luvun lopusta samalla tyylillä', disabled: !chapterHasText, disabledTip: 'Luvussa ei ole vielä tekstiä' },
        { mode: 'expand', text: 'Kirjoita tiivistelmästä', tip: 'Tekoäly kirjoittaa tiivistelmästäsi tai juonirungostasi valmista tekstiä', disabled: false },
        { mode: 'rewrite', text: 'Kirjoita valinta uudelleen', tip: 'Tekoäly kirjoittaa valitsemasi tekstin uudelleen ohjeesi mukaan', disabled: !hasSelection, disabledTip: 'Valitse ensin tekstistä kohta, jonka haluat kirjoittaa uudelleen' },
        { mode: 'scene', text: 'Kirjoita kohtaus', tip: 'Tekoäly kirjoittaa kohtauksen kuvauksesi pohjalta', disabled: false }
      ];
      // The scene request knows three lengths (the thresholds of handleGenerateScene)
      const sceneLength = hybridTargetWords <= 600
        ? 'lyhyt (noin 500 sanaa)'
        : hybridTargetWords >= 1500
          ? `pitkä (noin ${(2000).toLocaleString('fi-FI')} sanaa)`
          : `keskipitkä (noin ${(1000).toLocaleString('fi-FI')} sanaa)`;
      const previewWords = continuePreview ? continuePreview.split(/\s+/).filter(Boolean).length : 0;
      const appendsOrReplaces = hybridMode === 'expand' || hybridMode === 'scene';
      // The filled part of a slider's track (the range recipe reads --value)
      const trackFill = (value, min, max) => ({ '--value': Math.min(Math.max((value - min) / (max - min), 0), 1) * 100 + '%' });

      // A form: a press on the scrim closes nothing; Esc does what the close button does (R-69, R-70)
      return e(Dialog, {
        title: 'Kirjoita tekoälyn kanssa',
        // M C.14 row 19, with the comma Finnish puts before 'ennen kuin'
        sub: e('span', { className: 'faust-dialog__lede' }, 'Tekoäly ehdottaa tekstiä. Mitään ei lisätä lukuun, ennen kuin hyväksyt ehdotuksen.'),
        size: 'lg',
        // Its tabs change the content in place: the panel keeps its top, so the tab row does not jump
        className: 'faust-dialog--steady',
        busy: continuingWriting,
        onClose: closeWriting,
        footer: continuePreview
          ? [
              e('button', {
                key: 'reject',
                type: 'button',
                className: 'faust-btn faust-btn--lg faust-btn--quiet',
                onClick: () => rejectContinuation()
              }, 'Hylkää'),
              e('button', {
                key: 'again',
                type: 'button',
                className: 'faust-btn faust-btn--lg',
                disabled: continuingWriting,
                onClick: requestSuggestion
              }, 'Luo uusi ehdotus'),
              appendsOrReplaces && e('button', {
                key: 'replace',
                type: 'button',
                className: 'faust-btn faust-btn--lg',
                onClick: () => acceptExpansion()
              }, 'Korvaa koko luku…'),
              e('button', {
                key: 'accept',
                type: 'button',
                className: 'faust-btn faust-btn--lg faust-btn--primary',
                onClick: () => (hybridMode === 'rewrite' ? acceptRewrite() : acceptContinuation())
              }, hybridMode === 'rewrite' ? 'Korvaa valittu teksti' : 'Lisää luvun loppuun')
            ]
          // A form: Peruuta and its action at bottom right (M B.11)
          : [
              e('button', {
                key: 'cancel',
                type: 'button',
                className: 'faust-btn faust-btn--lg',
                onClick: closeWriting
              }, 'Peruuta'),
              e('button', {
                key: 'request',
                type: 'button',
                className: 'faust-btn faust-btn--lg faust-btn--primary',
                disabled: requestBlocked,
                title: blockedReason,
                'aria-busy': continuingWriting ? 'true' : undefined,
                onClick: requestSuggestion
              },
                continuingWriting && e('span', { className: 'faust-spinner faust-spinner--sm' }),
                continuingWriting ? 'Luodaan ehdotusta…' : 'Luo ehdotus'
              )
            ]
      },
            continuePreview
              // The ehdotus
              ? e('div', { className: 'faust-result' },
                  e('div', { className: 'faust-result__head' },
                    e('span', { className: 'faust-label' }, 'Ehdotus · ' + count(previewWords, 'sana'))
                  ),
                  e('div', { className: 'faust-result__body' },
                    e('div', { className: 'faust-prose' }, continuePreview)
                  )
                )
              // The request
              : e(React.Fragment, null,
                  // The shared tab row (arrow keys, Home, End; lead decision 5 of 18 Nov 2026). While a
                  // suggestion is being created the other controls are disabled (V 4.8, busy).
                  e('div', { style: { marginBottom: 'var(--sp-5)' } },
                    e(Tabs, {
                      label: 'Kirjoita tekoälyn kanssa',
                      value: hybridMode,
                      onChange: (mode) => { if (!continuingWriting) setHybridMode(mode); },
                      items: modeTabs.map(tab => ({
                        id: tab.mode,
                        label: tab.text,
                        title: tab.disabled ? tab.disabledTip : tab.tip,
                        disabled: tab.disabled || continuingWriting
                      }))
                    })
                  ),

                  // Jatka tekstiä
                  hybridMode === 'continue' && e('label', { className: 'faust-field' },
                    e('span', { className: 'faust-field__label' }, `Kappaleiden määrä: ${continueParagraphs}`),
                    e('input', {
                      type: 'range',
                      min: 1,
                      max: 5,
                      value: continueParagraphs,
                      disabled: continuingWriting,
                      style: trackFill(continueParagraphs, 1, 5),
                      onChange: (ev) => setContinueParagraphs(parseInt(ev.target.value))
                    }),
                    e('span', { className: 'faust-field__hint' }, 'Tekoäly jatkaa luvun lopusta samalla tyylillä.')
                  ),

                  // Kirjoita tiivistelmästä
                  hybridMode === 'expand' && e(React.Fragment, null,
                    e('label', { className: 'faust-field' },
                      e('span', { className: 'faust-field__label' }, 'Tiivistelmä tai juonirunko'),
                      e('textarea', {
                        className: 'faust-textarea faust-textarea--author',
                        value: hybridInput,
                        disabled: continuingWriting,
                        onChange: (ev) => setHybridInput(ev.target.value),
                        placeholder: 'Kirjoita lyhyt tiivistelmä tai juonirunko, josta tekoäly kirjoittaa valmista tekstiä…'
                      })
                    ),
                    e('div', {
                      style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 200px', gap: 'var(--sp-6)', alignItems: 'end', marginTop: 'var(--sp-4)' }
                    },
                      e('label', { className: 'faust-field' },
                        e('span', { className: 'faust-field__label' }, `Pituus: noin ${hybridTargetWords.toLocaleString('fi-FI')} sanaa`),
                        e('input', {
                          type: 'range',
                          min: 500,
                          max: 4000,
                          step: 500,
                          value: hybridTargetWords,
                          disabled: continuingWriting,
                          style: trackFill(hybridTargetWords, 500, 4000),
                          onChange: (ev) => setHybridTargetWords(parseInt(ev.target.value))
                        })
                      ),
                      e('label', { className: 'faust-field', style: { marginTop: 0 } },
                        e('span', { className: 'faust-field__label' }, 'Tyyli'),
                        e('select', {
                          className: 'faust-select',
                          value: hybridStyle,
                          disabled: continuingWriting,
                          onChange: (ev) => setHybridStyle(ev.target.value)
                        },
                          e('option', { value: 'vivid' }, 'Eloisa'),
                          e('option', { value: 'concise' }, 'Tiivis'),
                          e('option', { value: 'descriptive' }, 'Kuvaileva'),
                          e('option', { value: 'dialogue-heavy' }, 'Dialogipainotteinen')
                        )
                      )
                    )
                  ),

                  // Kirjoita valinta uudelleen
                  hybridMode === 'rewrite' && (hasSelection
                    ? e(React.Fragment, null,
                        e('div', { className: 'faust-excerpt', style: { marginBottom: 'var(--sp-4)' } },
                          e('div', { className: 'faust-excerpt__caption' }, 'Valittu teksti'),
                          e('div', { className: 'faust-excerpt__text' }, textSelection.text)
                        ),
                        e('label', { className: 'faust-field' },
                          e('span', { className: 'faust-field__label' }, 'Ohje tekoälylle'),
                          e('input', {
                            type: 'text',
                            className: 'faust-input',
                            value: hybridInput,
                            disabled: continuingWriting,
                            onChange: (ev) => setHybridInput(ev.target.value),
                            placeholder: 'esim. ”tee dramaattisemmaksi”, ”lisää dialogia”, ”tiivistä”'
                          })
                        )
                      )
                    : e('div', { className: 'faust-empty' },
                        e('div', { className: 'faust-empty__title' }, 'Valitse ensin tekstistä kohta, jonka haluat kirjoittaa uudelleen.')
                      )
                  ),

                  // Kirjoita kohtaus
                  hybridMode === 'scene' && e(React.Fragment, null,
                    e('label', { className: 'faust-field' },
                      e('span', { className: 'faust-field__label' }, 'Kohtauksen kuvaus'),
                      e('textarea', {
                        className: 'faust-textarea faust-textarea--author',
                        value: hybridInput,
                        disabled: continuingWriting,
                        onChange: (ev) => setHybridInput(ev.target.value),
                        placeholder: 'Kuvaile kohtaus lyhyesti: keitä on paikalla, mitä tapahtuu, mikä on tunnelma…'
                      })
                    ),
                    e('label', { className: 'faust-field' },
                      e('span', { className: 'faust-field__label' }, 'Pituus: ' + sceneLength),
                      e('input', {
                        type: 'range',
                        min: 300,
                        max: 2500,
                        step: 100,
                        value: hybridTargetWords,
                        disabled: continuingWriting,
                        style: trackFill(hybridTargetWords, 300, 2500),
                        onChange: (ev) => setHybridTargetWords(parseInt(ev.target.value))
                      })
                    )
                  )
                )
      );
    })()),

    // Claude Chat Component
    // Never unmounted: the conversation lives in its state and survives focus mode and the switch
    e(ErrorBoundary, { label: 'Keskustelu', onDismiss: () => setClaudeChatOpen(false) }, window.ClaudeChat && e(window.ClaudeChat, {
      project: project,
      // A chapter marked "Ei tekoälylle" lends the chat neither its summary nor its text
      activeChapter: chapterNoAI ? null : activeChapter,
      isOpen: claudeChatOpen && !aiAssistantOpen && !aiDisabled,
      // The answer's label: the short name of the model the old handler uses
      modelName: modelLabel(aiSource && (aiSource.provider === 'cherry' ? aiSource.model : aiSource.anthropicModel)),
      // Its own Esc (in its field) and its close button: the focus goes to the manuscript
      onClose: () => closePanelKeepingFocus('.claude-chat-container', () => setClaudeChatOpen(false)),
      // A chapter marked "Ei tekoälylle" takes no answer (the chat, lent no chapter, shows no button)
      onInsertText: (text) => {
        if (activeChapter && !chapterNoAI) {
          // The text as the editor has it now, not as it was at the last render
          const base = liveContentRef.current.chapterId === activeChapter.id
            ? liveContentRef.current.content
            : (activeChapter.content || '');
          updateChapterContent(base + (base.trim() ? '\n\n' : '') + text, false, { noMerge: true });
        }
      }
    })),

    // The keskustelu has no floating opener: the header's Keskustelu button (or its row in the
    // header's "more" menu below 1120 px) and Näytä ▸ Keskustelu open it.

    // Notifications (the replacement for native alert boxes)
    e(ToastHost),
    // Layer host: popovers, menus and tooltips render here through ReactDOM.createPortal
    e('div', { className: 'faust-layer' })
  );
}

// Mount the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(e(ErrorBoundary, { label: 'FAUST', root: true }, e(FAUSTApp)));

console.log('[FAUST] Simple app loaded ✨');
console.log('[FAUST] VERSION: 2025-10-22-23:40 - LIMINAL ENGINE ADDED');

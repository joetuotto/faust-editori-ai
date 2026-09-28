/**
 * Finnish spelling and grammar checking with Voikko (Rust/WASM build, runs
 * locally; no text leaves the machine). Custom words come from the user's
 * dictionary (userData/sanakirja.txt) and the project's .faust/words.txt.
 */
import { app } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { GrammarIssue } from '../shared/types';
import { matchesKnownWord, parseWordList } from '../shared/spelling';
import { writeFileAtomic } from './fsutil';

interface VoikkoInstance {
  spell(word: string): boolean;
  suggest(word: string): string[];
  grammarErrors(text: string): { startPos: number; errorLen: number; suggestions: string[]; shortDescription: string }[];
  setAcceptFirstUppercase(value: boolean): void;
  setIgnoreNumbers(value: boolean): void;
  setAcceptUnfinishedParagraphsInGc(value: boolean): void;
  setAcceptTitlesInGc(value: boolean): void;
}

let voikko: Promise<VoikkoInstance | null> | null = null;
let userWords = new Set<string>();
let projectWords = new Set<string>();
let projectPath: string | null = null;

function getVoikko(): Promise<VoikkoInstance | null> {
  voikko ??= (async () => {
    try {
      const { Voikko } = await import('@yongsk0066/voikko');
      const instance = (await Voikko.init('fi')) as unknown as VoikkoInstance;
      instance.setAcceptFirstUppercase(true);
      instance.setIgnoreNumbers(true);
      // Don't flag the paragraph being typed or headings
      instance.setAcceptUnfinishedParagraphsInGc(true);
      instance.setAcceptTitlesInGc(true);
      return instance;
    } catch (error) {
      console.error('[language] Voikko failed to load:', error);
      return null;
    }
  })();
  return voikko;
}

function userDictionaryPath() {
  return path.join(app.getPath('userData'), 'sanakirja.txt');
}

function projectDictionaryPath(dir: string) {
  return path.join(dir, '.faust', 'words.txt');
}

async function readWords(file: string): Promise<Set<string>> {
  try {
    return parseWordList(await fs.readFile(file, 'utf-8'));
  } catch {
    return new Set();
  }
}

export async function loadDictionaries(dir: string | null) {
  projectPath = dir;
  userWords = await readWords(userDictionaryPath());
  projectWords = dir ? await readWords(projectDictionaryPath(dir)) : new Set();
}

function isCustomWord(word: string) {
  return matchesKnownWord(word, projectWords) || matchesKnownWord(word, userWords);
}

export async function isAvailable(): Promise<boolean> {
  return (await getVoikko()) !== null;
}

/** Returns the subset of `words` that are misspelled */
export async function check(words: string[]): Promise<string[]> {
  const v = await getVoikko();
  if (!v) return [];
  return words.filter(w => !isCustomWord(w) && !v.spell(w));
}

export async function suggest(word: string): Promise<string[]> {
  const v = await getVoikko();
  return v ? v.suggest(word).slice(0, 8) : [];
}

/** Grammar issues per paragraph; offsets are relative to each paragraph */
export async function grammar(paragraphs: string[]): Promise<GrammarIssue[][]> {
  const v = await getVoikko();
  if (!v) return paragraphs.map(() => []);
  return paragraphs.map(text =>
    text.trim()
      ? v.grammarErrors(text).map(e => ({
          start: e.startPos,
          length: e.errorLen,
          suggestions: e.suggestions,
          description: e.shortDescription
        }))
      : []
  );
}

/** Add a word to the project's dictionary (shared with co-writers via git) or the user's */
export async function addWord(word: string, scope: 'project' | 'user'): Promise<void> {
  const clean = word.trim();
  if (!clean) return;
  if (scope === 'project' && projectPath) {
    projectWords.add(clean.toLowerCase());
    await writeFileAtomic(projectDictionaryPath(projectPath), [...projectWords].sort().join('\n') + '\n');
  } else {
    userWords.add(clean.toLowerCase());
    await writeFileAtomic(userDictionaryPath(), [...userWords].sort().join('\n') + '\n');
  }
}

/**
 * Validation Utilities
 * Common validation functions for project data
 */

import type { Project, Chapter, Character } from '../types';

/**
 * Validate project structure
 */
export function validateProject(project: any): project is Project {
  if (!project || typeof project !== 'object') {
    return false;
  }

  // Check required fields
  if (typeof project.title !== 'string') return false;
  if (typeof project.author !== 'string') return false;
  if (!Array.isArray(project.structure)) return false;

  return true;
}

/**
 * Validate chapter structure
 */
export function validateChapter(chapter: any): chapter is Chapter {
  if (!chapter || typeof chapter !== 'object') {
    return false;
  }

  if (typeof chapter.id !== 'string') return false;
  if (typeof chapter.title !== 'string') return false;
  if (typeof chapter.content !== 'string') return false;

  return true;
}

/**
 * Validate character structure
 */
export function validateCharacter(character: any): character is Character {
  if (!character || typeof character !== 'object') {
    return false;
  }

  if (typeof character.id !== 'string') return false;
  if (typeof character.name !== 'string') return false;

  return true;
}

/**
 * Sanitize text input (remove potentially harmful content)
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove null bytes
  let sanitized = text.replace(/\0/g, '');

  // Trim excessive whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Validate word count is reasonable
 */
export function isValidWordCount(count: number): boolean {
  return typeof count === 'number' && count >= 0 && count < 10000000;
}

/**
 * Validate email format (for author field)
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate API key format
 */
export function isValidAPIKey(key: string, provider: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  switch (provider) {
    case 'anthropic':
      return key.startsWith('sk-ant-');
    case 'openai':
      return key.startsWith('sk-');
    case 'grok':
      return key.startsWith('xai-');
    case 'deepseek':
      return key.length > 10; // Generic validation
    case 'google':
      return key.length > 10; // Generic validation
    default:
      return key.length > 0;
  }
}

/**
 * Check if object is empty
 */
export function isEmpty(obj: any): boolean {
  if (obj === null || obj === undefined) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  if (typeof obj === 'string') return obj.trim().length === 0;
  return false;
}

export default {
  validateProject,
  validateChapter,
  validateCharacter,
  sanitizeText,
  isValidWordCount,
  isValidEmail,
  isValidAPIKey,
  isEmpty
};

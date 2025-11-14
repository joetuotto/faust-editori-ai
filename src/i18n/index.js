/**
 * i18n Loader for FAUST Editor
 * Supports Finnish and English translations
 */

const fi = require('./fi');
const en = require('./en');

const translations = {
  fi,
  en
};

/**
 * Get current system locale
 * @returns {string} - Locale code (fi, en)
 */
function getSystemLocale() {
  const locale = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || '';

  if (locale.startsWith('fi')) return 'fi';
  if (locale.startsWith('en')) return 'en';

  // Default to Finnish
  return 'fi';
}

/**
 * Load translations for given locale
 * @param {string} locale - Locale code (fi, en)
 * @returns {Object} - Translation object
 */
function loadTranslations(locale = 'fi') {
  return translations[locale] || translations.fi;
}

/**
 * Get translation value by path
 * @param {Object} t - Translation object
 * @param {string} path - Dot-separated path (e.g., 'file.menu')
 * @returns {string} - Translated string
 */
function getTranslation(t, path) {
  const keys = path.split('.');
  let value = t;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return path; // Return path if not found
    }
  }

  return value;
}

module.exports = {
  loadTranslations,
  getSystemLocale,
  getTranslation,
  availableLocales: Object.keys(translations)
};

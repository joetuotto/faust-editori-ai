/**
 * FAUST - Application Constants
 * Shared constants across the application
 */

// Genre options for projects
export const GENRE_OPTIONS = [
  { value: 'fiction', label: 'Fiktio' },
  { value: 'fantasy', label: 'Fantasia' },
  { value: 'scifi', label: 'Sci-fi' },
  { value: 'mystery', label: 'Mysteeri' },
  { value: 'thriller', label: 'Trilleri' },
  { value: 'romance', label: 'Romanssi' },
  { value: 'horror', label: 'Kauhu' },
  { value: 'literary', label: 'Kaunokirjallisuus' },
  { value: 'nonfiction', label: 'Tietokirja' }
];

// Location types
export const LOCATION_TYPES = [
  { value: 'home', label: 'Koti' },
  { value: 'city', label: 'Kaupunki' },
  { value: 'nature', label: 'Luonto' },
  { value: 'building', label: 'Rakennus' },
  { value: 'vehicle', label: 'Ajoneuvo' },
  { value: 'fantasy', label: 'Fantasiamaailma' },
  { value: 'other', label: 'Muu' }
];

// Location atmospheres
export const LOCATION_ATMOSPHERES = [
  { value: 'peaceful', label: 'Rauhallinen' },
  { value: 'tense', label: 'Jännittävä' },
  { value: 'mysterious', label: 'Mystinen' },
  { value: 'dangerous', label: 'Vaarallinen' },
  { value: 'cozy', label: 'Viihtyisä' },
  { value: 'eerie', label: 'Aavemainen' },
  { value: 'busy', label: 'Vilkas' },
  { value: 'abandoned', label: 'Hylätty' }
];

// Location importance levels
export const LOCATION_IMPORTANCE = [
  { value: 'major', label: 'Pääpaikka' },
  { value: 'minor', label: 'Sivupaikka' },
  { value: 'mentioned', label: 'Mainittu' }
];

// Thread types
export const THREAD_TYPES = [
  { value: 'main_plot', label: 'Pääjuoni' },
  { value: 'subplot', label: 'Sivujuoni' },
  { value: 'character_arc', label: 'Hahmon kehitys' },
  { value: 'theme', label: 'Teema' },
  { value: 'mystery', label: 'Mysteeri' },
  { value: 'romance', label: 'Romanssi' }
];

// Thread status
export const THREAD_STATUS = [
  { value: 'planned', label: 'Suunniteltu' },
  { value: 'active', label: 'Aktiivinen' },
  { value: 'developing', label: 'Kehittyy' },
  { value: 'resolved', label: 'Ratkaistu' },
  { value: 'abandoned', label: 'Hylätty' }
];

// Thread priority
export const THREAD_PRIORITY = [
  { value: 'critical', label: 'Kriittinen' },
  { value: 'high', label: 'Korkea' },
  { value: 'medium', label: 'Keskitaso' },
  { value: 'low', label: 'Matala' }
];

// Chapter status
export const CHAPTER_STATUS = [
  { value: 'plan', label: 'Suunnitelma' },
  { value: 'draft', label: 'Luonnos' },
  { value: 'revision', label: 'Revisio' },
  { value: 'final', label: 'Valmis' }
];

// Character gender options
export const GENDER_OPTIONS = [
  { value: 'male', label: 'Mies' },
  { value: 'female', label: 'Nainen' },
  { value: 'non-binary', label: 'Muu' },
  { value: 'other', label: 'Muu' }
];

// POV types
export const POV_TYPES = [
  { value: 'first', label: '1. persoona' },
  { value: 'third_limited', label: '3. persoona (rajoitettu)' },
  { value: 'third_omniscient', label: '3. persoona (kaikkitietävä)' },
  { value: 'second', label: '2. persoona' }
];

// Time of day
export const TIME_OF_DAY = [
  { value: 'dawn', label: 'Aamunkoitto' },
  { value: 'morning', label: 'Aamu' },
  { value: 'noon', label: 'Keskipäivä' },
  { value: 'afternoon', label: 'Iltapäivä' },
  { value: 'evening', label: 'Ilta' },
  { value: 'night', label: 'Yö' },
  { value: 'midnight', label: 'Keskiyö' }
];

// Weather conditions
export const WEATHER_CONDITIONS = [
  { value: 'clear', label: 'Kirkas' },
  { value: 'cloudy', label: 'Pilvinen' },
  { value: 'rainy', label: 'Sateinen' },
  { value: 'stormy', label: 'Myrskyinen' },
  { value: 'snowy', label: 'Luminen' },
  { value: 'foggy', label: 'Sumuinen' },
  { value: 'windy', label: 'Tuulinen' }
];

// Export/import formats
export const EXPORT_FORMATS = [
  { value: 'txt', label: 'Tekstidokumentti (.txt)', extension: 'txt' },
  { value: 'md', label: 'Markdown (.md)', extension: 'md' },
  { value: 'html', label: 'HTML (.html)', extension: 'html' },
  { value: 'rtf', label: 'Rich Text (.rtf)', extension: 'rtf' },
  { value: 'pdf', label: 'PDF (.pdf)', extension: 'pdf' },
  { value: 'docx', label: 'Word Document (.docx)', extension: 'docx' },
  { value: 'epub', label: 'EPUB E-book (.epub)', extension: 'epub' }
];

// Validation rules
export const VALIDATION_RULES = {
  CHARACTER_NAME_MIN_LENGTH: 1,
  CHARACTER_NAME_MAX_LENGTH: 100,
  LOCATION_NAME_MIN_LENGTH: 1,
  LOCATION_NAME_MAX_LENGTH: 100,
  THREAD_NAME_MIN_LENGTH: 1,
  THREAD_NAME_MAX_LENGTH: 150,
  CHAPTER_TITLE_MIN_LENGTH: 1,
  CHAPTER_TITLE_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 5000
};

// UI Themes
export const THEMES = {
  NOX: 'NOX',  // Dark mode
  DEIS: 'DEIS'  // Light mode
};

// AI Writing Modes (already in project.ai.modes, but defining labels here)
export const AI_MODE_LABELS = {
  exploration: 'Exploration',
  production: 'Production',
  polish: 'Polish'
};

// Default values
export const DEFAULTS = {
  CHAPTER_STATUS: 'draft',
  THREAD_STATUS: 'planned',
  THREAD_PRIORITY: 'medium',
  LOCATION_IMPORTANCE: 'minor',
  TARGET_WORD_COUNT: 80000,
  DAILY_WORD_GOAL: 1000,
  AUTOSAVE_INTERVAL: 30000, // 30 seconds
  BACKUP_INTERVAL: 300000 // 5 minutes
};

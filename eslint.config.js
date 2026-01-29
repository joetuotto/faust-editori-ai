// ESLint 9.x Flat Config for FAUST
// @see https://eslint.org/docs/latest/use/configure/configuration-files-new

const js = require('@eslint/js');
const react = require('eslint-plugin-react');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  // Base recommended config
  js.configs.recommended,

  // Prettier compatibility (disables conflicting rules)
  prettierConfig,

  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-installer/**',
      'build/**',
      '*.backup*',
      '*.with-changes',
      'coverage/**',
    ],
  },

  // Main config for JS files
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script', // Most files use IIFE pattern, not ES modules
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        getComputedStyle: 'readonly',
        MutationObserver: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',

        // Node.js globals (for Electron main process)
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'writable',
        Buffer: 'readonly',
        global: 'readonly',

        // React (loaded via CDN)
        React: 'readonly',
        ReactDOM: 'readonly',

        // FAUST globals
        ANNOTATION_TYPES: 'readonly',
        AI_PROVIDERS: 'readonly',
        AI_MODELS: 'readonly',
        DEFAULT_SHORTCUTS: 'readonly',
        THEMES: 'readonly',
        COMPLEXITY_WEIGHTS: 'readonly',
        STORY_COMPLEXITY_TIERS: 'readonly',
        callAIProvider: 'readonly',
        CharacterGenerator: 'readonly',
        ComplexityAnalyzer: 'readonly',
        RefinementManager: 'readonly',

        // Electron globals
        electronAPI: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      prettier,
    },
    rules: {
      // Prettier integration
      'prettier/prettier': 'warn',

      // Error prevention
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'no-undef': 'error',
      'no-console': 'off', // Console is fine for this app

      // Best practices
      'eqeqeq': ['warn', 'smart'],
      'no-var': 'warn',
      'prefer-const': 'warn',

      // React rules
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react/prop-types': 'off', // Not using PropTypes
      'react/react-in-jsx-scope': 'off', // React is global
    },
    settings: {
      react: {
        version: '18.2',
      },
    },
  },

  // Config for ES modules (newer files)
  {
    files: ['**/*.mjs', 'webpack.config.js', 'eslint.config.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },

  // Config for test files
  {
    files: ['test/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        // Jest globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        jest: 'readonly',
      },
    },
  },
];

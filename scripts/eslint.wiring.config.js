// One rule: no-undef on the files webpack bundles as ES modules. Globals are listed inline on purpose.
const names = (list) => Object.fromEntries(list.split(/\s+/).filter(Boolean).map((n) => [n, 'readonly']));
module.exports = [{
  files: ['**/*.js'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    globals: {
      ...names(`window document navigator console alert confirm prompt localStorage sessionStorage fetch
        setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame queueMicrotask
        URL URLSearchParams Blob File FileReader FormData Image Audio Event CustomEvent KeyboardEvent MouseEvent
        Node Element HTMLElement HTMLTextAreaElement HTMLInputElement DOMParser MutationObserver ResizeObserver IntersectionObserver
        AbortController TextEncoder TextDecoder Intl performance getComputedStyle structuredClone crypto atob btoa
        SpeechRecognition webkitSpeechRecognition globalThis
        React ReactDOM require process`),
      module: 'writable', exports: 'writable'
    }
  },
  linterOptions: { reportUnusedDisableDirectives: 'off' },
  rules: { 'no-undef': 'error' }
}];

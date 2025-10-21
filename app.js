const { useState, useRef, useEffect, useCallback, useMemo } = React;
const e = React.createElement;

const StoryContinuityTracker = require('./modules/StoryContinuityTracker');
const HybridWritingFlow = require('./modules/HybridWritingFlow');
const BatchProcessor = require('./modules/BatchProcessor');
const CostOptimizer = require('./modules/CostOptimizer');

// PR1: Import contrast guard (feature: teemat & typografia)
const { applyContrastGuard } = require('./utils/contrast');

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const levenshtein = (a = '', b = '', maxDistance = 2) => {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const lenA = a.length;
  const lenB = b.length;

  if (Math.abs(lenA - lenB) > maxDistance) {
    return maxDistance + 1;
  }

  const previous = new Array(lenB + 1);
  const current = new Array(lenB + 1);

  for (let j = 0; j <= lenB; j += 1) {
    previous[j] = j;
  }

  for (let i = 0; i < lenA; i += 1) {
    current[0] = i + 1;
    let rowMin = current[0];

    for (let j = 0; j < lenB; j += 1) {
      const cost = a[i] === b[j] ? 0 : 1;
      const insertion = current[j] + 1;
      const deletion = previous[j + 1] + 1;
      const substitution = previous[j] + cost;

      const value = Math.min(insertion, deletion, substitution);
      current[j + 1] = value;
      if (value < rowMin) {
        rowMin = value;
      }
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    for (let j = 0; j <= lenB; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[lenB];
};

// At top, add style tag or in existing CSS
const style = document.createElement('style');
style.textContent = `
@font-face {
  font-family: 'Inter';
  src: url('./build/fonts/Inter-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'Inter';
  src: url('./build/fonts/Inter-Bold.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
}
:root {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
`;
document.head.appendChild(style);

// Ikonit
const Icons = {
  Book: () => e('svg', { className: 'w-6 h-6', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' })
  ),
  Menu: () => e('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M4 6h16M4 12h16M4 18h16' })
  ),
  Plus: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 4v16m8-8H4' })
  ),
  Trash: () => e('svg', { className: 'w-3 h-3', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' })
  ),
  ChevronDown: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 9l-7 7-7-7' })
  ),
  ChevronRight: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 5l7 7-7 7' })
  ),
  Sun: () => e('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z' })
  ),
  Moon: () => e('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z' })
  ),
  Sparkles: () => e('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' })
  ),
  Save: () => e('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4' })
  ),
  Upload: () => e('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' })
  ),
  Download: () => e('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' })
  ),
  Eye: () => e('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' }),
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' })
  ),
  Search: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' })
  ),
  EyeOff: () => e('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21' })
  ),
  Loader: () => e('svg', { className: 'w-4 h-4 animate-spin', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('circle', { cx: 12, cy: 12, r: 10, stroke: 'currentColor', strokeWidth: 4, fill: 'none', opacity: 0.25 }),
    e('path', { fill: 'currentColor', d: 'M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z' })
  ),
  X: () => e('svg', { className: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M6 18L18 6M6 6l12 12' })
  ),
  FileText: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })
  ),
  Folder: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' })
  ),
  AlignLeft: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M4 6h16M4 12h16M4 18h7' })
  ),
  Filter: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z' })
  ),
  Camera: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z' }),
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M15 13a3 3 0 11-6 0 3 3 0 016 0z' })
  ),
  Clock: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' })
  ),
  Collection: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' })
  ),
  Tag: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' })
  ),
  Maximize: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4' })
  ),
  Columns: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v2m0 0V7a2 2 0 00-2-2h-2' })
  ),
  Typewriter: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' }),
    e('circle', { cx: 12, cy: 12, r: 2, stroke: 'currentColor', strokeWidth: 2, fill: 'none' })
  )
};

// Story Continuity Tracker - centralizes chronology, thread status, and immutable facts
// FAUST Visual System: DEIS (Light) & NOX (Dark)
const FAUST_STYLES = `
  :root {
    /* FAUST NOX - Refined Palette */
    --faust-dark: #100F0D;
    --faust-shadow: #1A1815;
    --faust-bg-primary: #141210;
    --faust-paper: #F0E8DC;
    --faust-ink: #E9E4DA;
    
    --faust-gold: #9A7B4F;
    --faust-gold-hover: #C89D5E;
    --faust-bronze: #715C38;
    --faust-brass: #9F885C;
    --faust-accent: #C89D5E;
    
    /* Text Hierarchy */
    --faust-text-primary: #E9E4DA;
    --faust-text-secondary: #AFA699;
    --faust-text-tertiary: #8C806C;
    
    /* Borders */
    --faust-border: rgba(154, 123, 79, 0.2);
    --faust-border-highlight: #9A7B4F;
    
    /* Sigil Colors */
    --sigil-invocation: #9F885C;
    --sigil-conjunction: #8C744C;
    --sigil-separation: #A28554;
    --sigil-transformation: #9A7B4F;
    --sigil-illumination: #BFA772;
    --sigil-calcination: #7E6946;
    
    /* Faust Spec: Sigil hover/active */
    --sigil-hover-aura: 0 0 12px rgba(200,157,94,0.3);
    --sigil-active-pulse: 0 0 20px rgba(200,157,94,0.5);
    
    /* FAUST Typography */
    --font-body: "IBM Plex Mono", "Iosevka Aile", monospace;
    --font-heading: "EB Garamond", "Canela", serif;
    --font-mono: "Space Mono", "IBM Plex Mono", monospace;
    --font-sigil: "Faust Rune Sans", system-ui, sans-serif;
    
    /* Hierarchical Spacing */
    --space-component: 12px;
    --space-component-lg: 16px;
    --space-section: 28px;
    --space-section-lg: 32px;
    --space-xs: 8px;
    --space-sm: 12px;
    --space-md: 16px;
    --space-lg: 20px;
    --space-xl: 24px;
    --space-xxl: 32px;
    
    /* Shadows */
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08);
    --shadow-md: 0 4px 8px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08);
    --shadow-lg: 0 10px 20px rgba(0,0,0,0.15), 0 3px 6px rgba(0,0,0,0.10);
    --shadow-window: 0 25px 50px rgba(0,0,0,0.30);
    
    /* Radius */
    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 10px;
    --radius-xl: 12px;
    
    /* Transitions */
    --ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1);
  }
  
  /* FAUST DEIS (Light Mode) - Contrast Guard ≥4.5:1 */
  [data-theme="light"] {
    --faust-bg-primary: #F8F2E8;
    --faust-paper: #F2EADF;
    --faust-dark: #E6DED2;
    --faust-shadow: #E6DED2;
    
    /* Contrast-guarded text colors */
    --faust-text-primary: #2B241C;
    --faust-ink: #2B241C;
    --faust-text-secondary: #5E584D;
    --faust-text-tertiary: #867C6B;
    
    --faust-gold: #C89D5E;
    --faust-gold-hover: #D8C28F;
    --faust-bronze: #715C38;
    --faust-brass: #A9875A;
    --faust-accent: #C89D5E;
    
    /* Sigil Colors - DEIS */
    --sigil-invocation: #B68B5C;
    --sigil-conjunction: #A9875A;
    --sigil-separation: #C8A768;
    --sigil-transformation: #C89D5E;
    --sigil-illumination: #D8C28F;
    --sigil-calcination: #8F7A53;
    
    /* Borders */
    --faust-border: rgba(113, 92, 56, 0.25);
    --faust-border-highlight: #C89D5E;
  }
  
  /* Base Styles */
  * {
    box-sizing: border-box;
  }
  
  body {
    font-family: var(--font-body);
    background: radial-gradient(ellipse at center, var(--faust-bg-primary) 60%, var(--faust-dark) 100%);
    color: var(--faust-text-primary);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    transition: background-color 0.8s ease-in-out, color 0.8s ease-in-out;
  }
  
  /* Smooth transitions */
  button, input, textarea, select {
    transition: background-color 0.15s var(--ease-in-out),
                color 0.15s var(--ease-in-out),
                border-color 0.15s var(--ease-in-out),
                box-shadow 0.15s var(--ease-in-out),
                transform 0.15s var(--ease-in-out);
  }
  
  /* FAUST Input & Textarea - Paper & Ink */
  input, textarea, select {
    background: var(--faust-paper) !important;
    color: #26231E !important;
    border: 1px solid var(--faust-border) !important;
    box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.08) !important;
  }
  
  input:focus, textarea:focus, select:focus {
    background: var(--faust-paper) !important;
    border-color: var(--faust-gold) !important;
    box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.1), 0 0 0 3px rgba(154, 123, 79, 0.15) !important;
  }
  
  textarea {
    font-family: var(--font-body);
    line-height: 1.65;
    font-size: 15px;
    letter-spacing: 0.01em;
  }
  
  /* Writing area - Paper effect */
  textarea.editor-main {
    background: var(--faust-paper) !important;
    box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.15) !important;
  }
  
  /* Cursor breathing animation */
  textarea:focus {
    caret-color: #26231E;
    animation: cursor-breathe 1.2s ease-in-out infinite;
  }
  
  @keyframes cursor-breathe {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  
  /* Focus visible - FAUST Gold */
  *:focus-visible {
    outline: 2px solid var(--faust-gold);
    outline-offset: 2px;
  }
  
  /* Scrollbars */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  
  ::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.2);
    border-radius: 4px;
  }
  
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(255,255,255,0.3);
  }
  
  /* FAUST Ritualistic Mode Transition */
  @keyframes faust-ritual-swipe {
    0% {
      opacity: 0.8;
      background: linear-gradient(90deg, transparent 0%, var(--faust-gold-bright) 50%, transparent 100%);
      background-size: 200% 100%;
      background-position: -200% 0;
    }
    100% {
      opacity: 1;
      background-position: 200% 0;
    }
  }
  
  [data-transitioning="true"] {
    position: relative;
  }
  
  [data-transitioning="true"]::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    animation: faust-ritual-swipe 0.8s ease-in-out;
  }
  
  /* Animations */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
  
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  
  /* NATSUME: Organic Animations */
  @keyframes breatheIn {
    0% { opacity: 0; transform: scale(1.02); }
    100% { opacity: 1; transform: scale(1); }
  }
  
  @keyframes breatheOut {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(0.98); }
  }
  
  @keyframes wave {
    0% { opacity: 0; transform: translateY(3px); }
    50% { opacity: 1; transform: translateY(-1px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  /* Faust Spec: Sigil hover/active animations */
  @keyframes sigil-pulse {
    0%, 100% { 
      box-shadow: var(--sigil-active-pulse); 
      transform: scale(1);
    }
    50% { 
      box-shadow: 0 0 30px rgba(200,157,94,0.7);
      transform: scale(1.02);
    }
  }
  
  /* Sigil button hover effect */
  button.sigil-btn:hover {
    box-shadow: var(--sigil-hover-aura);
    transition: box-shadow 200ms ease-in-out;
  }
  
  /* Sigil button active effect */
  button.sigil-btn:active,
  button.sigil-btn.active {
    animation: sigil-pulse 400ms ease-in-out;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  .animate-breatheIn {
    animation: breatheIn 0.6s ease-in forwards;
  }
  
  .animate-breatheOut {
    animation: breatheOut 0.6s ease-out forwards;
  }
  
  .animate-wave {
    animation: wave 0.8s cubic-bezier(0.4, 0.0, 0.2, 1) forwards;
  }
  
  .animate-slideIn {
    animation: slideIn 0.4s ease-out forwards;
  }
  
  .animate-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  
  /* FAUST Typography Hierarchy */
  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading);
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--faust-text-primary);
  }
  
  h1 { font-size: 24px; }
  h2 { font-size: 20px; }
  h3 { font-size: 18px; }
  h4 { font-size: 16px; }
  
  /* Panel Headers */
  .panel-header {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--faust-text-primary);
    margin-bottom: var(--space-component-lg);
  }
  
  /* Meta text */
  .meta-text {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 300;
    color: var(--faust-text-secondary);
    opacity: 0.8;
  }
  
  /* FAUST Panel Backgrounds - Enhanced Contrast */
  .panel-sidebar-left {
    background-color: var(--faust-dark) !important;
    /* 5% darker than primary for clarity */
    border-right: 1px solid rgba(154, 123, 79, 0.1);
  }
  
  .panel-sidebar-right {
    background-color: var(--faust-shadow) !important;
    /* 3% contrast from primary */
    border-left: 1px solid rgba(154, 123, 79, 0.1);
  }
  
  .panel-editor {
    background-color: var(--faust-paper) !important;
    box-shadow: inset 0 0 16px rgba(0, 0, 0, 0.2) !important;
    /* Candlelight effect */
  }
  
  /* FAUST Tag & Button Design */
  .faust-tag, .faust-button {
    background: rgba(200, 157, 94, 0.15);
    color: var(--faust-text-primary);
    border: 1px solid var(--faust-border);
    border-radius: 8px;
    padding: 8px 16px;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: all 200ms ease-in-out;
    cursor: pointer;
  }
  
  .faust-tag:hover, .faust-button:hover {
    background: rgba(200, 157, 94, 0.25);
    box-shadow: 0 0 0 3px rgba(154, 123, 79, 0.2);
    transform: translateY(-1px);
  }
  
  .faust-tag:active, .faust-button:active {
    transform: translateY(0);
  }
  
  /* AI Category Colors */
  .ai-category-literary {
    background: linear-gradient(135deg, rgba(200, 157, 94, 0.2) 0%, rgba(169, 134, 75, 0.15) 100%);
  }
  
  .ai-category-psychology {
    background: linear-gradient(135deg, rgba(182, 139, 95, 0.2) 0%, rgba(156, 115, 76, 0.15) 100%);
  }
  
  .ai-category-rhetoric {
    background: linear-gradient(135deg, rgba(142, 122, 86, 0.2) 0%, rgba(122, 104, 72, 0.15) 100%);
  }
  
  .ai-category-advanced {
    background: linear-gradient(135deg, rgba(116, 101, 75, 0.2) 0%, rgba(95, 85, 63, 0.15) 100%);
  }
  
  /* Sigil Effects */
  .sigil {
    filter: drop-shadow(0 0 4px rgba(154, 123, 79, 0.4));
    transition: all 200ms ease-out;
  }
  .sigil:hover {
    filter: drop-shadow(0 0 8px rgba(154, 123, 79, 0.6));
  }
  /* FAUST Component Overrides - Selective */
  
  /* Light backgrounds need dark text */
  .bg-white:not(button):not(.modal):not(.panel) {
    background-color: var(--faust-paper) !important;
    color: #26231E !important;
  }
  
  /* Dark backgrounds need light text */
  .bg-gray-900, .bg-gray-800, .bg-black {
    background-color: var(--faust-dark) !important;
    color: var(--faust-text-primary) !important;
  }
  
  .bg-gray-700 {
    background-color: var(--faust-shadow) !important;
    color: var(--faust-text-primary) !important;
  }
  /* Buttons and interactive elements on dark backgrounds */
  button, .button, [role="button"] {
    color: var(--faust-text-primary) !important;
  }
  
  button.bg-white, .button.bg-white {
    color: #26231E !important;
  }
  
  /* Text colors - only override when safe */
  .text-gray-600:not(button), .text-gray-500:not(button) {
    color: var(--faust-text-secondary) !important;
  }
  
  .text-gray-400:not(button) {
    color: var(--faust-text-tertiary) !important;
  }
  
  /* Borders */
  .border-gray-200, .border-gray-300, .border-gray-700, .border-gray-600 {
    border-color: var(--faust-border) !important;
  }
  
  /* Placeholder text - Contrast-aware */
  ::placeholder {
    color: var(--faust-text-tertiary) !important;
    opacity: 0.4;
  }
  
  [data-theme="light"] ::placeholder {
    color: var(--faust-text-tertiary) !important;
    opacity: 0.45;
  }
  
  /* Inline metadata styling - #tags and @entities */
  .inline-tag {
    color: var(--faust-gold);
    background: rgba(154, 123, 79, 0.1);
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }
  
  .inline-tag:hover {
    background: rgba(154, 123, 79, 0.2);
    box-shadow: 0 0 0 2px rgba(154, 123, 79, 0.3);
  }
  
  .inline-mention {
    color: var(--faust-brass);
    background: rgba(159, 136, 92, 0.1);
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
    border-bottom: 1px dashed var(--faust-brass);
  }
  
  .inline-mention:hover {
    background: rgba(159, 136, 92, 0.2);
    border-bottom-style: solid;
  }
  
  /* Ensure all dark panels have light text */
  [class*="bg-gray-"]:not([class*="bg-gray-50"]):not([class*="bg-gray-100"]) {
    color: var(--faust-text-primary);
  }
  
  [class*="bg-black"] {
    color: var(--faust-text-primary);
  }
  
  /* NATSUME: Flow Mode Transitions */
  .flow-transition {
    transition: background 1s ease-in-out, filter 2s ease-in-out;
  }
  
  .mode-focus {
    background: linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%);
  }
  
  .mode-rhythm {
    background: linear-gradient(180deg, #1a1a2a 0%, #0f0f1f 100%);
  }
  
  .mode-review {
    background: linear-gradient(180deg, #1a1f1a 0%, #0f140f 100%);
  }
  
  .tone-calm {
    filter: saturate(0.8);
  }
  
  .tone-tense {
    filter: saturate(1.2) contrast(1.1);
  }
  
  /* NORMAN: Inline Suggestion Affordance */
  .inline-suggestion {
    border-bottom: 2px dashed rgba(10, 132, 255, 0.4);
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .inline-suggestion:hover {
    border-color: var(--mac-accent-blue);
    background: rgba(10, 132, 255, 0.1);
  }
  
  /* SAGMEISTER: Organic Glow Effects */
  @keyframes glow-slide {
    0%, 100% { 
      background-position: 0% 50%; 
      opacity: 0.3;
    }
    50% { 
      background-position: 100% 50%; 
      opacity: 0.6;
    }
  }
  @keyframes pulse-glow {
    0%, 100% { 
      filter: blur(20px);
    }
    50% { 
      filter: blur(30px);
    }
  }
  .glow-suggestion {
    position: relative;
    display: inline-block;
  }
  
  .glow-suggestion::before {
    content: '';
    position: absolute;
    inset: -4px;
    z-index: -1;
    background: linear-gradient(90deg, rgba(10,132,255,0.3), rgba(191,90,242,0.3), rgba(10,132,255,0.3));
    background-size: 200% 100%;
    border-radius: 4px;
    animation: glow-slide 3s ease-in-out infinite, pulse-glow 2s ease-in-out infinite;
  }
  /* SAGMEISTER: Living Typography - adapts to writing speed */
  .living-typography {
    transition: font-size 1.5s cubic-bezier(0.4, 0.0, 0.2, 1),
                letter-spacing 1.5s cubic-bezier(0.4, 0.0, 0.2, 1);
  }
  
  /* PENTAGRAM: Optimal reading width */
  .typographic-container {
    max-width: 800px;
    margin: 0 auto;
  }
  
  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

// Label värit
const LABEL_COLORS = [
  { id: 'none', name: 'Ei merkintää', color: 'transparent' },
  { id: 'red', name: 'Punainen', color: '#ef4444' },
  { id: 'orange', name: 'Oranssi', color: '#f97316' },
  { id: 'yellow', name: 'Keltainen', color: '#eab308' },
  { id: 'green', name: 'Vihreä', color: '#22c55e' },
  { id: 'blue', name: 'Sininen', color: '#3b82f6' },
  { id: 'purple', name: 'Violetti', color: '#a855f7' },
  { id: 'pink', name: 'Pinkki', color: '#ec4899' }
];
// LocationKeeper - Paikkamalli
const LOCATION_TEMPLATE = {
  id: null,
  name: '',
  type: '', // city, building, landmark, public_square, street, nature, interior, transport
  city: '',
  country: '',
  coordinates: { lat: null, lng: null },
  
  facts: {
    history: '',
    architecture: [],
    features: [],
    atmosphere: []
  },
  
  visual: {
    colors_day: [],
    colors_night: [],
    lighting: [],
    textures: []
  },
  
  genre_descriptions: {}, // { genre: description }
  
  used_in_scenes: [],
  notes: '',
  image_refs: [],
  
  // Web search tulokset
  research: {
    last_searched: null,
    facts_source: '',
    images_source: ''
  }
};

// Genre-vaihtoehdot
const GENRE_OPTIONS = [
  { id: 'psychological_thriller', name: 'Psykologinen trilleri', icon: '🧠' },
  { id: 'romantic_drama', name: 'Romanttinen draama', icon: '❤️' },
  { id: 'action_thriller', name: 'Toimintatrilleri', icon: '💥' },
  { id: 'horror', name: 'Kauhu', icon: '👻' },
  { id: 'noir', name: 'Noir / Rikosromaani', icon: '🕵️' },
  { id: 'historical_fiction', name: 'Historiallinen fiktio', icon: '📜' },
  { id: 'literary_fiction', name: 'Kirjallinen fiktio', icon: '📚' },
  { id: 'fantasy', name: 'Fantasia', icon: '🐉' },
  { id: 'scifi', name: 'Sci-fi', icon: '🚀' },
  { id: 'mystery', name: 'Mysteeri', icon: '🔍' }
];

// Paikkatyypit
const LOCATION_TYPES = [
  { id: 'city', name: 'Kaupunki', icon: '🏙️' },
  { id: 'building', name: 'Rakennus', icon: '🏢' },
  { id: 'landmark', name: 'Maamerkki', icon: '🗼' },
  { id: 'public_square', name: 'Aukio', icon: '🏛️' },
  { id: 'street', name: 'Katu', icon: '🛣️' },
  { id: 'nature', name: 'Luonto', icon: '🌲' },
  { id: 'interior', name: 'Sisätila', icon: '🚪' },
  { id: 'transport', name: 'Kulkuneuvo', icon: '🚂' }
];

// StoryKeeper - Tarinan rakenne mallit
const CHAPTER_TEMPLATE = {
  chapter: 1,
  title: '',
  summary: '',
  key_events: [],
  story_time: '',  // "Maanantai 9:00"
  real_time: '',   // "2024-03-15 09:00:00"
  duration: '',    // "2h"
  pov: '',         // Kenen näkökulma
  location: '',    // Missä tapahtuu
  status: 'not_started',  // not_started / in_progress / completed
  word_count: 0
};

const EVENT_TEMPLATE = {
  id: null,
  description: '',
  chapter: 1,
  timestamp: '',  // "Luku 3, s.45"
  significance: 'minor',  // major / minor
  requires: [],     // [event_ids] mitä täytyy olla ennen
  consequences: [], // [event_ids] mihin tämä vaikuttaa
  opens_threads: [],  // [thread_ids]
  closes_threads: [], // [thread_ids]
  immutable: false,   // voiko tämä muuttua?
  character_involved: [],  // [character_ids]
  location: ''
};

const THREAD_TEMPLATE = {
  id: null,
  name: '',
  description: '',
  opened_chapter: null,
  closed_chapter: null,
  status: 'open',  // open / closed / abandoned
  importance: 'minor',  // major / minor / subplot
  mentions: []  // [{chapter, note}] missä luvuissa mainitaan
};

// Vaihe 5: Hahmomalli - CharacterKeeper
const CHARACTER_TEMPLATE = {
  id: null,
  name: '',
  bio: {
    age: null,
    gender: '',
    occupation: '',
    appearance: ''
  },
  psychology: {
    want: '',          // Mitä hahmo haluaa
    fear: '',          // Mitä hahmo pelkää
    weakness: '',      // Hahmon heikkous
    values: []         // Arvot (esim. "rehellisyys", "perhe")
  },
  voice: {
    description: '',   // Miten hahmo puhuu
    avgSentenceLength: 12,
    lexicon: [],       // Tyypilliset sanat/fraasit
    disallowed: []     // Kielletyt ilmaukset
  },
  state: {
    injuries: [],      // Loukkaantumiset
    resources: [],     // Esineet/taidot
    mood: '',          // Nykyinen mieliala
    beliefs: {}        // Uskomukset (key-value)
  },
  arc: [],             // Hahmokaaren kehitys [{scene, belief, trigger}]
  relationships: [],   // Suhteet [{with, trust, tension, lastEvent}]
  lastSeen: {
    scene: '',
    location: '',
    time: ''
  },
  notes: ''            // Vapaat muistiinpanot
};

// Suhdetyypit
const RELATIONSHIP_TYPES = [
  { id: 'family', name: 'Perhe', color: '#ef4444' },
  { id: 'friend', name: 'Ystävä', color: '#22c55e' },
  { id: 'romantic', name: 'Romanttinen', color: '#ec4899' },
  { id: 'enemy', name: 'Vihollinen', color: '#dc2626' },
  { id: 'colleague', name: 'Kollega', color: '#3b82f6' },
  { id: 'mentor', name: 'Mentori', color: '#a855f7' },
  { id: 'stranger', name: 'Tuntematon', color: '#6b7280' }
];

// Vaihe 5: Kirjoitustekniikat-objekti
const WRITING_TECHNIQUES = {
  literary: {
    title: '📚 KIRJALLISUUSTIEDE',
    color: 'purple',
    techniques: [
      {
        id: 'defamiliarization',
        name: 'Defamiliarisaatio',
        description: 'Tee tutusta vieraaksi - riko kielen järjestys',
        prompt: `Olet kirjoituskonsultti. Sovella DEFAMILIARISAATIOTA (остранение) tähän tekstiin.

TEKSTI:
{{CONTENT}}

DEFAMILIARISAATIO: Tee tutusta oudoksuttavaa rikkaamalla normaalit kieli- ja havaintomallit.

TEKNIIKAT:
1. **Riko lausejärjestys**: "Sydän lyö" → "Sydän. Lyönti. Pysähdys."
2. **Vieraannuta sanat**: "Kävellä" → "Liike jalkojen kautta, yksi, toinen, yksi"
3. **Vääristä näkökulma**: Kerro tuttu asia kuin ensimmäistä kertaa
4. **Irrota merkitys**: Hajota toiminto osiin

ESIMERKKI:
ENNEN: "Hän avasi oven ja astui sisään."
JÄLKEEN: "Metallikahva. Kylmä. Kiertyminen. Rako levenee. Valo vuotaa. Askel. Toinen. Hän on sisällä."

ANNA:
- 3-5 defamiliarisaatio-ehdotusta
- Säilytä ydinsisältö mutta tee se oudoksuttavaksi
- Selitä miksi muutos toimii

VASTAA SUOMEKSI.`
      },
      {
        id: 'sensory_richness',
        name: 'Aistillisuus',
        description: 'Aktivoi kaikki viisi aistia',
        prompt: `Lisää AISTILLISET YKSITYISKOHDAT tähän tekstiin:

TEKSTI:
\{{CONTENT}}

LISÄÄ:
1. **Näkö** (värit, muodot, liike, valo/varjo)
2. **Kuulo** (äänet, hiljaisuus, rytmit, kaikuja)
3. **Haju** (tuoksut, lemut, ilman laatu)
4. **Maku** (jos relevantti - ilman maku, muistot)
5. **Tunto** (tekstuurit, lämpötila, kosketus, paineet)

TAVOITE: Aktivoi lukijan keho, ei vain mieli.

ÄLÄ:
- Listaa aistihavaintoja ("Hän näki X, kuuli Y, haisti Z")
- Lisää yksityiskohtia väkisin
- Unohda kontekstia

ANNA:
- 3-5 konkreettista lisäystä
- Integroi ne luonnollisesti tekstiin
- Selitä miksi kukin vahvistaa kokemusta

VASTAA SUOMEKSI.`
      },
      {
        id: 'symbolic_redundancy',
        name: 'Symbolinen redundanssi',
        description: 'Toista motiivia hienovaraisesti läpi tekstin',
        prompt: `Analysoi ja vahvista SYMBOLISTA REDUNDANSSIA:

TEKSTI:
\{{CONTENT}}

SYMBOLINEN REDUNDANSSI: Toista keskeinen motiivi/symboli/kuva hienovaraisesti eri muodoissa läpi tekstin.

ESIMERKKI:
Motiivi: "Murtuminen"
- Rivi 1: "Lasi säröili ikkunassa"
- Rivi 45: "Hänän äänensä katkesi"
- Rivi 89: "Luottamus repeytyi"

TEHTÄVÄ:
1. Tunnista mahdollinen ydinmotiivi tekstistä
2. Ehdota 3-5 paikkaa missä sitä voi toistaa hienovaraisesti
3. Vaihtele muotoa (konkreetti → abstrakti, verbaali → visuaalinen)

ANNA:
- Tunnistettu motiivi
- Nykyiset esiintymät
- Uudet esiintymis-ehdotukset
- Selitys miksi redundanssi toimii

VASTAA SUOMEKSI.`
      },
      {
        id: 'rhythm_breath',
        name: 'Rytmi & Hengitys',
        description: 'Vaihtele lausepituuksia orgaanisesti',
        prompt: `Optimoi tekstin RYTMI JA HENGITYS:

TEKSTI:
\{{CONTENT}}

RYTMI: Vaihtele lausepituuksia luoden orgaaninen hengitysrytmi.

TEKNIIKAT:
1. **Lyhyt-lyhyt-pitkä**: Jännite → jännite → purkaus
2. **Pitkä-lyhyt**: Rakennus → räjähdys
3. **Staccato**: Lyhyt. Lyhyt. Lyhyt. = ahdistus, kiire
4. **Legato**: Pitkät, virtaavat lauseet = rauha, kontemplаatio

ESIMERKKI:
ENNEN: "Hän käveli kadulla. Hän näki jonkun. Hän tunsi pelon."
JÄLKEEN: "Hän käveli. Katu. Joku - siellä, varjoissa, liikkumatta. Paniikki valutti kylkeä pitkin kuin jääkylmä vesi."

ANNA:
- Nykyinen rytmi-analyysi (montako sanaa per lause)
- 3-5 rytmikorjausta
- Selitä miten rytmi tukee tunnelmaa

VASTAA SUOMEKSI.`
      },
      {
        id: 'negative_space',
        name: 'Tyhjä tila',
        description: 'Jätä aukkoja lukijan täytettäväksi',
        prompt: `Luo TYHJÄÄ TILAA (negative space) tekstiin:
TEKSTI:
\{{CONTENT}}
TYHJÄ TILA: Älä kerro kaikkea. Jätä aukkoja, epävarmuutta, tulkinnanvaraa.

TEKNIIKAT:
1. **Poisjättö**: Kerro A ja C, mutta älä B:tä
2. **Vihjeet**: Anna fragmentteja, älä kokonaisuutta
3. **Epävarmuus**: "Ehkä", "Luultavasti", "Hän ajatteli että"
4. **Keskenjättö**: Keskeytä lause, jätä ajatus roikkumaan

ESIMERKKI:
ENNEN: "Hän näki miehen ja tunsi olevansa vaarassa, koska mies katsoi uhkaavasti."
JÄLKEEN: "Hän näki miehen. Jotain katseessa. Hän kääntyi nopeasti pois."

ANNA:
- 3-5 kohtaa missä voit jättää tyhjää tilaa
- Säilytä ydinviesti mutta tee se epäsuoraksi
- Selitä miten tämä sitouttaa lukijaa

VASTAA SUOMEKSI.`
      }
    ]
  },

  psychological: {
    title: '🧠 PSYKOLOGIA',
    color: 'blue',
    techniques: [
      {
        id: 'peak_end',
        name: 'Peak-End Rule',
        description: 'Huippu keskellä, ankkuri lopussa',
        prompt: `Sovella PEAK-END RULE tähän tekstiin:
TEKSTI:
\{{CONTENT}}

PEAK-END RULE: Lukijat muistavat kaksi asiaa: ensiksi intensiivisimmän hetken ja toiseksi lopun.

RAKENNE:
1. **Alku**: Johdanto, aseta odotukset
2. **Peak**: Emotionaalinen/jännittynein hetki (2/3 kohdalla)
3. **Lasku**: Laskeva toiminta
4. **End**: Ankkuri - voimakas loppu joka jää mieleen

ESIMERKKI:
- Peak: "Veitsi viilsi hänen selkänsä yli"
- End: "Hän sulki oven. Hiljaisuus. Hän oli yksin."

TEHTÄVÄ:
1. Tunnista nykyinen peak (jos on)
2. Ehdota vahvempaa peak-hetkeä
3. Suunnittele voimakas end-hetki
4. Anna konkreettinen rakenne

VASTAA SUOMEKSI.`
      },
      {
        id: 'emotional_contagion',
        name: 'Tunnetartunta',
        description: 'Äänteet vaikuttavat alitajuntaan',
        prompt: `Optimoi TUNNETARTUNTA (emotional contagion):

TEKSTI:
\{{CONTENT}}
TUNNETARTUNTA: Äänteiden (foneemien) valinnalla voit tartuttaa tunteita.

ÄÄNNE-EMOTIO MAP:
- **Pehmeät** (l, m, n, v, h): Rauha, lämpö, hellyys
- **Kovat** (k, t, p, r): Jännite, voima, aggressio
- **Sibilantit** (s, sh): Hiljaisuus, salaisuus, pelko
- **Nasaalit** (m, n): Sulkeutuminen, sisäänpäinkääntyminen

ESIMERKKI:
NEUTRAALI: "Hän käveli ulos ja lähti"
PEHMEÄ: "Hän livahti ulos ja haihtui hiljaa"
KOVA: "Hän karkasi ja katosi kiviseen katuhämärään"

ANNA:
- Analysoi nykyiset äänteet
- Ehdota 3-5 muutosta emotionaalisen vaikutuksen vahvistamiseksi
- Selitä miksi äännemaailma tukee tunnelmaa

VASTAA SUOMEKSI.`
      },
      {
        id: 'zeigarnik_effect',
        name: 'Zeigarnik-efekti',
        description: 'Avoimet silmukat valvottavat',
        prompt: `Luo ZEIGARNIK-EFEKTI tekstiin:

TEKSTI:
\{{CONTENT}}

ZEIGARNIK-EFEKTI: Keskeneräiset tehtävät/kysymykset jäävät mieleen ja valvottavat.

TEKNIIKAT:
1. **Avoin kysymys**: "Mikä se ääni oli?"
2. **Keskenjäänyt teko**: "Hän kurkotti ovenkahvaan mutta —"
3. **Ratkaisematon jännite**: "Joku teki sen. Mutta kuka?"
4. **Luvattu paljastus**: "Kolme sanaa. Hän kertoisi myöhemmin."

ESIMERKKI:
"Hän avasi kirjeen. Luki. Kasvot kalpenivat. Hän laski paperin hitaasti pöydälle ja katsoi ulos ikkunasta. Mitä siinä luki? Sitä hän ei voinut kertoa. Ei vielä."

TEHTÄVÄ:
1. Tunnista nykyiset avoimet silmukat (jos on)
2. Ehdota 3-5 uutta silmukkaa
3. Varmista että lupaat ratkaisun (myöhemmin)
4. Älä jätä KAIKKEA auki - vain keskeiset kysymykset

VASTAA SUOMEKSI.`
      },
      {
        id: 'affective_dissonance',
        name: 'Affektiivinen dissonanssi',
        description: 'Sekoita ristiriitaisia tunteita',
        prompt: `Luo AFFEKTIIVINEN DISSONANSSI:

TEKSTI:
\{{CONTENT}}

AFFEKTIIVINEN DISSONANSSI: Sekoita ristiriitaisia tunteita → luo kompleksisuutta.

ESIMERKKEJÄ:
- Suru + huumori: "Hän itki hautajaisissa. Sitten hän muisti sen vitsin jonka äiti oli kertonut. Hän nauroi. Itki. Nauroi."
- Rakkaus + viha: "Hän halusi halata häntä ja lyödä samaan aikaan."
- Pelko + uteliaisuus: "Älä avaa ovea. Mutta mitä sen takana on?"

TEHTÄVÄ:
1. Tunnista yksipuoliset tunnekuvaukset
2. Lisää vastakkainen tunne samaan hetkeen
3. Älä selitä ristiriitaa - anna sen olla
4. Anna 3-5 dissonanssi-ehdotusta

ESIMERKKI:
ENNEN: "Hän oli surullinen"
JÄLKEEN: "Kyyneleet valuivat, mutta hän hymyili. Jokin tässä oli vapauttavaa."

VASTAA SUOMEKSI.`
      },
      {
        id: 'cognitive_priming',
        name: 'Kognitiivinen priming',
        description: 'Ohjaa tulkintaa hienovaraisesti',
        prompt: `Käytä KOGNITIIVISTA PRIMING:IA:

TEKSTI:
\{{CONTENT}}

KOGNITIIVINEN PRIMING: Ohjaa lukijan tulkintaa hienovaraisilla vihjeillä ennen pääasiaa.

TEKNIIKAT:
1. **Sana-assosiaatiot**: Mainitse "terävä" → lukija odottaa vaaraa
2. **Väri-emotio**: "Harmaa" → melankoliaa, "Punainen" → intohimoa
3. **Kontekstuaaliset vihjeet**: "Hiljaisuus" → jännite kasvaa
4. **Metaforat**: "Ilma oli raskas" → ahdistus tulossa

ESIMERKKI:
ILMAN PRIMING: "Hän astui huoneeseen. Mies istui tuolissa."
PRIMING: "Ilma oli raskas, tunkkainen. Jotain oli pielessä. Hän astui huoneeseen. Mies istui tuolissa. Liikkumatta."

TEHTÄVÄ:
1. Tunnista kohdat missä haluat ohjata lukijan odotuksia
2. Lisää priming-sanoja/kuvia 1-2 lausetta ennen
3. Anna 3-5 priming-ehdotusta
4. Selitä miten priming muuttaa tulkintaa

VASTAA SUOMEKSI.`
      }
    ]
  },

  persuasion: {
    title: '🎯 VAIKUTTAMINEN',
    color: 'orange',
    techniques: [
      {
        id: 'ethos',
        name: 'Ethos (Luottamus)',
        description: 'Rakenna auktoriteetti ilman ylimielisyyttä',
        prompt: `Rakenna ETHOS (luottavuus):

TEKSTI:
\{{CONTENT}}

ETHOS: Rakenna lukijan luottamus kertojaasi/hahmoosi ilman että sanot "luota minuun".

TEKNIIKAT:
1. **Yksityiskohdat**: Osoita että tiedät mistä puhut (faktat, ammattisanasto)
2. **Nöyryys**: Tunnusta epävarmuus → paradoksaalisesti kasvattaa luottamusta
3. **Kokemuksen osoittaminen**: Näytä että olet kokenut tämän
4. **Johdonmukaisuus**: Pysy tyylissä ja äänessä

ESIMERKKI:
HEIKKO ETHOS: "Olen asiantuntija tässä asiassa."
VAHVA ETHOS: "Hän tutki haavaa. Reunat olivat sileät - leikkaus, ei repiä. Terävä veitsi, oikeastaan skalpelli. Leikkaajan käsi oli varma."

TEHTÄVÄ:
1. Tunnista kohdat missä tarvitaan luottavuutta
2. Lisää yksityiskohtia jotka osoittavat asiantuntemusta
3. Poista yltiöpäinen väittäminen
4. Anna 3-5 ethos-vahvistusta

VASTAA SUOMEKSI.`
      },
      {
        id: 'pathos',
        name: 'Pathos (Tunne)',
        description: 'Kosketa fyysisesti',
        prompt: `Vahvista PATHOS (emotionaalinen vaikutus):

TEKSTI:
\{{CONTENT}}

PATHOS: Kosketa lukijan tunteisiin niin että hänen KEHONSA reagoi.

TEKNIIKAT:
1. **Bodily sensations**: "Kurkkua kuristaa", "Vatsa kiristyy"
2. **Universaalit tunteet**: Menetys, pelko, rakkaus, pettymys
3. **Henkilökohtainen + universaali**: "Hänän kätensä" → jokainen muistaa omansa
4. **Konkreetti, ei abstrakti**: "Tyhjä tuoli" > "Yksinäisyys"

ESIMERKKI:
HEIKKO PATHOS: "Hän oli surullinen kun muisti äitiään."
VAHVA PATHOS: "Äidin tuoli oli tyhjä. Vain se peite, taitettu, niin kuin hän oli opettanut. Hänän kätensä värisivät kun hän kosketti sitä."

TEHTÄVÄ:
1. Tunnista abstraktit tunnekuvaukset
2. Muuta ne konkreettisiksi, kehollisiksi
3. Käytä yksityiskohtia jotka aktivoivat lukijan muistot
4. Anna 3-5 pathos-vahvistusta

VASTAA SUOMEKSI.`
      },
      {
        id: 'logos',
        name: 'Logos (Logiikka)',
        description: 'Piilota järki tunteeseen',
        prompt: `Integroi LOGOS (logiikka) narratiiviin:

TEKSTI:
\{{CONTENT}}

LOGOS: Rakenna looginen argumentti NÄYTTÄMÄLLÄ, ei selittämällä.

TEKNIIKAT:
1. **Syy-seuraus**: Näytä A → B → C luonnollisesti
2. **Todisteet havainnossa**: Anna faktat havaintoina, ei väittäminä
3. **Deduktiivinen logiikka hahmon kautta**: Hahmo päättelee, lukija seuraa
4. **Piilota opetus**: Älä saaraa - anna lukijan oppia havainnoistaan

ESIMERKKI:
HEIKKO LOGOS: "Hän ymmärsi että mies valehteli."
VAHVA LOGOS: "Mies sanoi tulleensa junalla. Mutta ei ollut märkä, vaikka satoi. Ja hänen kengissään oli punaista savea - sitä löytyi vain aseman takana olevalta rakennustyömaalta. Hän ei ollut tullut junalla."

TEHTÄVÄ:
1. Tunnista suorat selitykset/väittämät
2. Muuta ne havaintosarjoiksi
3. Anna lukijan päätellä itse
4. Anna 3-5 logos-vahvistusta

VASTAA SUOMEKSI.`
      },
      {
        id: 'suspense_dopamine',
        name: 'Suspense & Dopamiini',
        description: 'Lupaa, viivytä, paljasta',
        prompt: `Luo SUSPENSE (dopamiinivirtaus):

TEKSTI:
\{{CONTENT}}

SUSPENSE: Lupaa palkinto → Viivytä sitä → Paljasta (tai älä).

3-VAIHE RAKENNE:
1. **LUPAUS**: "Hän avasi kirjeen. Sisällä oli jotain, joka muuttaisi kaiken."
2. **VIIVYTYS**: "Mutta ensin hän piti kaivaa muististaan..." [2-3 kappaletta muuta]
3. **PALJASTUS/SUBVERSION**: "Hän luki. Kaksi sanaa. Hän ei ollut varma naurettaisiinko vai itkisikö."

DOPAMIINI: Ennakointi → Odotus → Tyydytys. Venytä "Odotus"-vaihetta.

TEHTÄVÄ:
1. Tunnista mahdolliset suspense-hetket
2. Lisää LUPAUS ennen paljastusta
3. Venytä VIIVYTYS (mutta älä liikaa)
4. Anna 3-5 suspense-rakennetta

VASTAA SUOMEKSI.`
      },
      {
        id: 'contrast_power',
        name: 'Kontrastin voima',
        description: 'Vastakohtaisuus vahvistaa',
        prompt: `Käytä KONTRASTIN VOIMAA:
TEKSTI:
\{{CONTENT}}
KONTRASTIN VOIMA: Aseta vastakohdat vierekkäin → kumpikin vahvistuu.
KONTRASTI-TYYPIT:
1. **Valo/Varjo**: "Aurinko paistoi, mutta hänen sisällään oli pimeys"
2. **Nopea/Hidas**: "Maailma kiiti ohi. Hän seisoi paikallaan."
3. **Hiljainen/Äänekäs**: "Kaupunki karjui. Hän kuiskasi."
4. **Suuri/Pieni**: "Vuoret kohoavat. Hän oli pieni kuin hiekanjyvä."
5. **Elämä/Kuolema**: "Vauva nauroi. Ruumis makasi hiljaa."
TEHTÄVÄ:
1. Tunnista koht at missä kontrasti vahvistaisi
2. Aseta vastakohdat vierekkäin (ei erilleen)
3. Älä selitä kontrastia - anna sen toimia
4. Anna 3-5 kontrasti-ehdotusta
ESIMERKKI:
ENNEN: "Hän oli onnellinen vaikka ympärillä oli surkeutta"
JÄLKEEN: "Ruumiita kadulla. Tuhkaa ilmassa. Hän hymyili ensimmäistä kertaa viikkoon."
VASTAA SUOMEKSI.`
      },
      {
        id: 'anchoring',
        name: 'Ankkurointi',
        description: 'Ensimmäinen mielikuva hallitsee kaikkea',
        prompt: `Käytä ANKKUROINTIA:
TEKSTI:
\{{CONTENT}}
ANKKUROINTI: Ensimmäinen kuvaus henkilöstä/paikasta/asiasta määrittää miten lukija tulkitsee kaiken myöhemmän.
TEKNIIKAT:
1. **Vahva ensivaikutelma**: Ensimmäinen lause hahmon esittelyssä on KRIITTINEN
2. **Kontrastoitu myöhemmin**: Ankkuri vs. realiteetti = jännite
3. **Moniaistillinen ankkuri**: Käytä useita aisteja ensikuvauksessa
4. **Emotionaalinen lataus**: Ankkuroi tunteeseen, ei vain ulkonäköön
ESIMERKKI:
HEIKKO ANKKURI: "Mies astui sisään. Hän oli pitkä."
VAHVA ANKKURI: "Mies täytti oviaukon. Ei vain kokonsa takia - jotain hänen katseessaan nielaisi valon, tilan, ilman. Huone pieneni."

TEHTÄVÄ:
1. Tunnista ensimmäiset kuvaukset (hahmo, paikka, asia)
2. Vahvista ne - lisää aisteja, emotioita, vaikutusta
3. Jos ankkuri on olemassa, voitko kontrastoida sitä myöhemmin?
4. Anna 3-5 ankkurointiehdotusta

VASTAA SUOMEKSI.`
      }
    ]
  },

  advanced: {
    title: '⚡ EDISTYNEET',
    color: 'red',
    techniques: [
      {
        id: 'meta_awareness',
        name: 'Meta-tason itsetietoisuus',
        description: 'Teksti tietää olevansa tekstiä',
        prompt: `Lisää META-TASON ITSETIETOISUUS:

TEKSTI:
\{{CONTENT}}

META: Teksti tietää olevansa tekstiä. Kertoja/hahmo kommentoi kirjoittamista/kerrontaa.

TEKNIIKAT:
1. **Kertojan itsereflektio**: "Miten tämän kertoisin? Sanat eivät riitä."
2. **Suora puhuttelu**: "Sinä, lukija, tiedät tämän tunteen."
3. **Kerronnan riko minen**: "Tämä ei ole se hetki jolloin hän kuoli. Se tulee myöhemmin."
4. **Kirjoittajan häivähdys**: "Jos olisin parempi kirjailija, osaisin kuvata..."

VAROITUS: Käytä säästeliäästi. Liika meta rikkoo immersion.

ESIMERKKI:
"Hän avasi oven. (Eikö tämä aina tapahdu näin? Ovi avautuu, ja kaikki muuttuu. Mutta me jatkamme lukemista, koska haluamme tietää mitä oven takana on.) Sisällä oli..."

ANNA:
- 2-3 meta-hetkeä (MAX)
- Varmista että ne palvelevat tarinaa
- Älä ylikäytä

VASTAA SUOMEKSI.`
      },
      {
        id: 'layering',
        name: 'Kerroksellisuus',
        description: 'Tarina tarinan sisällä',
        prompt: `Luo KERROKSELLISUUS:

TEKSTI:
\{{CONTENT}}

KERROKSELLISUUS: Useita kerrontatasoja jotka peilaavat toisiaan.

TASOT:
1. **Pääkertomus**: Nykyhetki
2. **Sisempi kertomus**: Muisto/flashback/tarina-tarinan-sisällä
3. **Symbolinen kerros**: Metaforat/kuvat jotka peilaavat pääkertomusta
TEKNIIKAT:
- **Frame narrative**: "Hän kertoi tarinan..." → sisempi tarina
- **Rinnakkaisuus**: Kaksi tarinaa samanaikaisesti, toinen peilaa toista
- **Metafora-kerros**: Luontokuvaus peilaa hahmon sisäistä tilaa

ESIMERKKI:
Kerros 1: "Hän istui kahvilassa, yksin."
Kerros 2: [Muisto äidistä, myös kahvilassa, myös yksin]
Kerros 3: "Ikkunassa sadeet iski lasin, yksinäiset pisarat."

TEHTÄVÄ:
1. Tunnista mahdolliset kerrokset
2. Ehdota sisempi tarina/muisto joka peilaa pääkertomusta
3. Lisää symbolinen kerros (luonto/sää/objekti)
4. Varmista että kerrokset keskustelevat keskenään

VASTAA SUOMEKSI.`
      },
      {
        id: 'unreliable_narrator',
        name: 'Epäluotettava kertoja',
        description: 'Lukija epäilee jokaista sanaa',
        prompt: `Luo EPÄLUOTETTAVA KERTOJA:

TEKSTI:
\{{CONTENT}}

EPÄLUOTETTAVA KERTOJA: Anna vihjeitä että kertoja/hahmo ei kerro totuutta (itselle tai lukijalle).

TEKNIIKAT:
1. **Ristiriidat**: Sanoo X, mutta toimii Y
2. **Liioittelu**: "Kaikki vihasivat häntä" (todella?)
3. **Valikoiva muisti**: "En muista mitä tapahtui seuraavaksi"
4. **Defensiivisyys**: "Se ei ollut minun vikani" (toistuvasti)
5. **Faktojen muutos**: Ensiksi sanoo A, myöhemmin B

ESIMERKKI:
"Hän ei ikinä huutanut minulle. Totta, hän korotti ääntään joskus, mutta se oli stressiä, työtä, ei minua. Hän rakasti minua. Sen tiedän. Vaikka hän sanoi... Ei, hän ei sanonut sitä. En muista oikein. Satoi kovasti sinä päivänä."

TEHTÄVÄ:
1. Lisää 2-3 ristiriitaa (sanat vs. teot)
2. Anna kertoja puolustautumaan liikaa
3. Käytä "ehkä", "luultavasti", "en muista"
4. ÄLÄ PALJASTA suoraan - anna lukijan epäillä

VASTAA SUOMEKSI.`
      },
      {
        id: 'silence_power',
        name: 'Hiljaisuuden voima',
        description: 'Sanomattomat sanat painavat eniten',
        prompt: `Käytä HILJAISUUDEN VOIMAA:

TEKSTI:
\{{CONTENT}}

HILJAISUUDEN VOIMA: Sanomatta jättäminen on voimakkaampi kuin sanominen.

TEKNIIKAT:
1. **Keskeytetty lause**: "Hän halusi sanoa että —"
2. **Hiljaisuus vastauksena**: "Rakastatko minua?' Hiljaisuus."
3. **Sanomaton ymmärrys**: "He katsoivat toisiaan. He tiesivät."
4. **Tyhjä tila dialogissa**: [ei tekstiä, vain välilyönti]

ESIMERKKI:
ENNEN: "Hän sanoi että rakasti häntä mutta ei ollut varma."
JÄLKEEN: "'Rakastan sinua', hän sanoi. Hiljaisuus venähti. Hän toisti: 'Rakastan.' Hän ei sanonut enää mitään."

TEHTÄVÄ:
1. Tunnista kohdat missä liikaa sanotaan
2. Poista sanoja, lisää hiljaisuutta
3. Käytä keskeytettyä puhetta
4. Anna 3-5 hiljaisuusehdotusta

MUISTA: Hiljaisuus on aktiivinen, ei passiivinen. Se PAISTAA.

VASTAA SUOMEKSI.`
      }
    ]
  },

  // Vaihe 6: LocationKeeper-tekniikat
  locationAnalysis: {
    title: '📍 PAIKKOJEN ANALYYSI',
    color: 'green',
    techniques: [
      {
        id: 'detect_locations',
        name: 'Tunnista paikat',
        description: 'Etsi kaikki paikat tekstistä automaattisesti',
        prompt: `Tunnista KAIKKI paikat tästä tekstistä. Sisällytä kaupungit, rakennukset, kadut, luontokohteet, maamerkit.
TEKSTI:
{{CONTENT}}

Palauta VAIN JSON (ei mitään muuta tekstiä):
{
  "locations": [
    {
      "name": "paikan nimi",
      "type": "city/building/landmark/public_square/street/nature/interior",
      "city": "kaupunki jos mainittu",
      "country": "maa jos mainittu",
      "context": "lause jossa paikka mainitaan"
    }
  ]
}
Jos ei paikkoja, palauta: {"locations": []}

VASTAA PELKKÄ JSON.`
      },
      {
        id: 'analyze_place',
        name: 'Analysoi paikka',
        description: 'Syväluotaava analyysi tietyn paikan tunnelmasta',
        prompt: `Analysoi tämä paikka kirjailijaa varten:

PAIKKA: {selectedLocation}

FAKTAT:
{{LOCATION_FACTS}}

VISUAALISET ELEMENTIT:
{{LOCATION_VISUAL}}

KIRJAN GENRE:
{{GENRE}}

Palauta JSON:
{
  "analysis": {
    "atmosphere": "paikan tunnelma",
    "sensory_details": ["aistilliset yksityiskohdat"],
    "genre_fit": "miten sopii genreen",
    "writing_opportunities": ["kirjoitusmahdollisuudet"]
  }
}
VASTAA SUOMEKSI, JSON-MUODOSSA.`
      },
      {
        id: 'generate_description',
        name: 'Generoi kuvaus',
        description: 'Luo genrespesifi kuvaus paikasta',
        prompt: `Olet LocationKeeper - paikkojen kuvausasiantuntija.

PAIKKA:
{selectedLocation}

FAKTAT:
{{LOCATION_FACTS}}

VISUAALISET ELEMENTIT:
{{LOCATION_VISUAL}}

KIRJAN GENRE:
{{GENRE}}

TEHTÄVÄ:
Kirjoita 2-4 kappaletta paikka-kuvausta joka:

1. **Faktatarkka**: Käytä todellisia yksityiskohtia paikasta
2. **Aistillinen**: Aktivoi näkö, kuulo, haju, tunto (ja maku jos relevantti)
3. **Genrespesifi**: Sovita tunnelma genreen ({{GENRE}})
4. **Tyylillinen**: Käytä defamiliarisaatiota, rytmiä, konkretiaa
5. **Emotionaalinen**: Luo tunnelma joka tukee kohtausta

GENRE-OHJEET:
{{GENRE_GUIDANCE}}

ÄLÄ:
- Listaa faktoja ("Paikalla on X ja Y")
- Kerro tunnelmaa suoraan ("Paikka oli ahdistava")
- Käytä kliseitä
- Ylihypettele

KIRJOITA NIIN ETTÄ SE SOPII SUORAAN ROMAANIIN.
VASTAA SUOMEKSI.`
      }
    ]
  },

  // Vaihe 5: CharacterKeeper-tekniikat
  characterContinuity: {
    title: '👥 HAHMOJEN JATKUVUUS',
    color: 'pink',
    techniques: [
      {
        id: 'check_all',
        name: 'Tarkista kaikki hahmot',
        description: 'Analysoi kaikkien hahmojen jatkuvuus tässä kohtauksessa',
        prompt: `Olet CharacterKeeper - hahmojen jatkuvuuden valvoja.

TEHTÄVÄ: Tarkista KAIKKI hahmot tässä kohtauksessa seuraavien kriteerien mukaan:

HAHMOT:
{characterList}

TARKISTETTAVAT ASIAT:
1. **Toimintalogiikka**: Ovatko hahmojen teot uskottavia heidän tavoitteidensa/pelkojensa/heikkouksiensa valossa?
2. **Ääni**: Puhuuko hahmo tyylilleen uskollisesti? (lausepituus, sanavalinnat)
3. **Psykologinen jatkuvuus**: Muuttuuko hahmon käytös liian äkillisesti ilman triggeriä?
4. **Faktat**: Ovatko fyysiset yksityiskohdat (ulkonäkö, ikä, loukkaantumiset) johdonmukaisia?
5. **Resurssit**: Käyttääkö hahmo esineitä/taitoja, joita hänellä ei ole?
6. **Suhteet**: Ovatko hahmojen väliset vuorovaikutukset uskottavia?

TEKSTI:
{{CONTENT}}

VASTAA TÄSSÄ MUODOSSA:

## 🟢 TOIMIVAT HAHMOT
[Listaa hahmot joiden jatkuvuus on kunnossa]

## 🟡 HUOMIOITAVAA
[Pienet epäjohdonmukaisuudet - ehdota korjaus]

## 🔴 KRIITTISET ONGELMAT
[Isot ristiriidat - vaativat korjauksia]

## 💡 EHDOTUKSET
[Konkreettiset parannukset - lisää trigger, muuta dialogi, korjaa fakta]

VASTAA SUOMEKSI.`
      },
      {
        id: 'check_voice',
        name: 'Tarkista ääni',
        description: 'Varmista että hahmo puhuu/ajattelee tyylilleen uskollisesti',
        prompt: `Tarkista ÄÄNIJATKUVUUS tälle hahmolle:

HAHMO:
{selectedCharacter}

HAHMON ÄÄNEN TUNNUSPIIRTEET:
- Puhetyyli: {voiceDescription}
- Tyypilliset fraasit: {lexicon}
- Lausepituus: noin {avgSentenceLength} sanaa

TEKSTI:
{{CONTENT}}

TARKISTA:
1. Onko dialogin tyyli johdonmukainen?
2. Käyttääkö hahmo tyypillisiä fraasejaan?
3. Onko lausepituus keskimäärin oikea?
4. Onko sanavalinnat hahmolle uskollisia?

ANNA:
- Arvosana 1-10
- Kohdat jotka eivät kuulosta hahmolta
- Korjausehdotukset (konkreettiset diff-muutokset)

VASTAA SUOMEKSI.`
      },
      {
        id: 'check_psychology',
        name: 'Tarkista psykologia',
        description: 'Analysoi hahmon päätösten ja tunteiden johdonmukaisuus',
        prompt: `Analysoi PSYKOLOGINEN JATKUVUUS:

HAHMO:
{selectedCharacter}

PSYKOLOGINEN PROFIILI:
- Tavoite: {want}
- Pelko: {fear}
- Heikkous: {weakness}
- Arvot: {values}

TEKSTI:
{{CONTENT}}

TARKISTA:
1. **Päätökset**: Ovatko hahmon valinnat johdonmukaisia tavoitteidensa kanssa?
2. **Reaktiot**: Ovatko tunnereaktion uskottavia?
3. **Tunne-hypyt**: Tapahtuuko liian suuria tunnemuutoksia ilman triggeriä?
4. **Arvo-ristiriidat**: Toimiiko hahmo arvojensa vastaisesti ilman hyvää syytä?

JOS LÖYDÄT ONGELMIA:
- Ehdota "mikrotriggeri" (pieni tapahtuma/muisto/bodysensaatio) joka perustelee muutoksen
- Tai suosittele teon/päätöksen muuttamista

VASTAA SUOMEKSI.`
      },
      {
        id: 'check_resources',
        name: 'Tarkista resurssit',
        description: 'Varmista että esineet/taidot/loukkaantumiset ovat johdonmukaisia',
        prompt: `Tarkista RESURSSIT JA FYYSISET FAKTAT:

HAHMO:
{selectedCharacter}

RESURSSIT/TAIDOT: {resources}
LOUKKAANTUMISET: {injuries}
ULKONÄKÖ: {appearance}

TEKSTI:
{{CONTENT}}

TARKISTA:
1. Käyttääkö hahmo esineitä joita hänellä ei ole?
2. Sovelletaanko taitoja jotka häneltä puuttuvat?
3. Onko loukkaantumisia mainittu/huomioitu?
4. Muuttuuko ulkonäkö ilman selitystä?
5. Ilmestyykö/häviääkö esineitä?

JOS LÖYDÄT VIRHEITÄ:
- Lisää esine aiempaan kohtaukseen TAI
- Poista viittaus esineeseen TAI
- Lisää lause joka selittää muutoksen

VASTAA SUOMEKSI konkretilla korjausehdotuksilla.`
      },
      {
        id: 'suggest_arc',
        name: 'Ehdota kehitystä',
        description: 'Anna ideoita hahmon psykologiseen kasvuun',
        prompt: `Ehdota HAHMOKAAREN KEHITYSTÄ:

HAHMO:
{selectedCharacter}

NYKYINEN TILA:
- Tavoite: {want}
- Pelko: {fear}
- Uskomukset: {beliefs}

KOHTAUKSEN SISÄLTÖ:
{{CONTENT}}

TEHTÄVÄ:
1. Tunnista 1-3 mahdollisuutta hahmon KASVUUN/MUUTOKSEEN tässä kohtauksessa
2. Ehdota triggeri joka voisi käynnistää muutoksen (paljastus, pettymys, voitto)
3. Kuvaa miten uskomus/arvo voisi muuttua
4. Pidä muutos realistisena (pieniä askeleita, ei äkkinäisiä täyskäännöksiä)

ESIMERKKI:
"Jos hahmo kohtaa tässä kohtauksessa ystävän pettämyksen, se voisi alkaa rapauttaa hänen uskoaan luottamukseen. Lisää pieni hetki jossa hän HUOMAA epäröivänsä (bodysensaatio: kädet kiristyvät nyrkkiin) ennen kuin vastaa ystävän kysymykseen."

ANNA 2-3 KONKREETTISTA KAARI-IDEAA. VASTAA SUOMEKSI.`
      },
      {
        id: 'create_trigger',
        name: 'Luo trigger-hetki',
        description: 'Luo uskottava syy isommalle muutokselle',
        prompt: `Luo TRIGGER-HETKI hahmon muutokselle:
HAHMO:
{selectedCharacter}

HALUTTU MUUTOS:
[Käyttäjä: Kerro mitä muutosta haluat - esim. "hahmo menettää luottamuksen mentoriinsa"]

KOHTAUS:
{{CONTENT}}

TEHTÄVÄ:
Luo USKOTTAVA TRIGGER joka perustelee muutoksen. Triggerin tulee:
1. Olla emotionaalisesti voimakas (shokki, paljastus, pettymys, voitto)
2. Yhdistyä hahmon pelkoihin/arvoihin
3. Olla konkreettinen ja koettavissa (nähdään/kuullaan/tunnetaan)
4. Johtaa luonnollisesti muutokseen

ANNA:
- 2-4 kappaleen triggeri-kohtaus (suoraan tekstiin lisättävä)
- Hahmon sisäinen reaktio (ajatukset/tunteet)
- Lyhyt selitys miten tämä johtaa muutokseen

KIRJOITA KAUNIISTI, KUIN OSA ROMAANIA. VASTAA SUOMEKSI.`
      }
    ]
  }
};

// ========== NORMAN-KRUG-NATSUME: UI/UX Components ==========

// NORMAN: AI Feedback Component - Shows what AI did with progressive disclosure
const AIFeedback = ({ action, details, type = 'info', onDismiss }) => {
  if (!action) return null;
  
  const icons = {
    info: '✨',
    success: '✅',
    learning: '🧠',
    rhythm: '🎵'
  };
  
  return e('div', { 
    className: 'fixed top-4 right-4 z-50 animate-slideIn'
  },
    e('div', { 
      className: 'bg-[var(--mac-bg-tertiary)] backdrop-blur-xl rounded-lg px-4 py-3 shadow-xl border border-[rgba(255,255,255,0.1)] max-w-sm'
    },
      e('div', { className: 'flex items-start gap-3' },
        // Icon
        e('div', { 
          className: 'w-6 h-6 rounded-full bg-[var(--mac-accent-blue)] flex items-center justify-center text-xs flex-shrink-0'
        }, icons[type]),
        
        // Content
        e('div', { className: 'flex-1 min-w-0' },
          e('div', { 
            className: 'text-sm font-medium',
            style: { color: 'var(--mac-text-primary)' }
          }, action),
          details && e('div', { 
            className: 'text-xs mt-1',
            style: { color: 'var(--mac-text-secondary)' }
          }, details)
        ),
        
        // Dismiss button
        onDismiss && e('button', {
          onClick: onDismiss,
          className: 'text-xs opacity-50 hover:opacity-100 transition-opacity'
        }, '×')
      )
    )
  );
};

// NORMAN: Contextual AI Bubble - Appears on cursor pause
const AIContextualBubble = ({ isVisible, suggestion, onApply, onDismiss, position }) => {
  if (!isVisible || !suggestion) return null;
  
  return e('div', { 
    className: 'absolute z-50 animate-breatheIn'
  },
    e('div', { className: 'relative' },
      // Arrow
      e('div', { 
        className: 'absolute -bottom-1 left-4 w-2 h-2 bg-[var(--mac-bg-tertiary)] rotate-45 border-r border-b border-[rgba(255,255,255,0.1)]'
      }),
      
      // Bubble content
      e('div', { 
        className: 'bg-[var(--mac-bg-tertiary)] rounded-lg p-3 shadow-lg border border-[rgba(255,255,255,0.1)] min-w-[280px]'
      },
        // Suggestion text
        e('div', { 
          className: 'text-xs mb-2',
          style: { color: 'var(--mac-text-secondary)' }
        }, suggestion.reason || 'AI-ehdotus'),
        
        // Actions - KRUG: Simple choice, not forced
        e('div', { className: 'flex gap-2' },
          e('button', {
            onClick: onApply,
            className: 'px-3 py-1 rounded bg-[var(--mac-accent-blue)] text-white text-xs font-medium hover:opacity-90 transition-all'
          }, '✨ Sovella'),
          e('button', {
            onClick: onDismiss,
            className: 'px-3 py-1 rounded text-xs hover:bg-[rgba(255,255,255,0.08)] transition-all',
            style: { color: 'var(--mac-text-secondary)' }
          }, 'Ei kiitos')
        )
      )
    )
  );
};

// NATSUME: Inspiration Panel - Appears when stuck
const InspirationPanel = ({ isVisible, inspiration, onDismiss }) => {
  if (!isVisible || !inspiration) return null;
  
  return e('div', { 
    className: 'fixed bottom-4 left-4 z-50 animate-slideIn'
  },
    e('div', { 
      className: 'bg-[var(--mac-bg-tertiary)] backdrop-blur-xl rounded-lg p-4 shadow-xl border border-[rgba(255,255,255,0.1)] max-w-xs'
    },
      // Header
      e('div', { className: 'flex items-center gap-2 mb-3' },
        e('span', { className: 'text-xl' }, '💡'),
        e('div', { 
          className: 'text-sm font-medium',
          style: { color: 'var(--mac-text-primary)' }
        }, 'Inspiraatio')
      ),
      
      // Content
      inspiration.type === 'quote' && e('blockquote', { 
        className: 'text-sm italic border-l-2 border-[var(--mac-accent-purple)] pl-3',
        style: { color: 'var(--mac-text-secondary)' }
      },
        `"${inspiration.text}"`,
        inspiration.author && e('cite', { 
          className: 'block text-xs mt-2 not-italic opacity-50'
        }, `— ${inspiration.author}`)
      ),
      
      inspiration.type === 'rhythm' && e('div', null,
        e('div', { 
          className: 'text-xs mb-2',
          style: { color: 'var(--mac-text-secondary)' }
        }, 'Kokeile tätä rytmiä:'),
        e('div', { 
          className: 'font-mono text-xs bg-black/20 rounded p-2',
          style: { color: 'var(--mac-text-primary)' }
        }, inspiration.pattern)
      ),
      
      // Dismiss
      e('button', {
        onClick: onDismiss,
        className: 'mt-3 text-xs opacity-50 hover:opacity-100 transition-opacity'
      }, 'Kiitos 👍')
    )
  );
};

// NATSUME: Flow Mode Indicator - Shows current mode subtly
const FlowModeIndicator = ({ mode }) => {
  if (mode === 'normal') return null;
  
  const labels = {
    focus: '🎯 Fokus',
    rhythm: '🎵 Rytmi',
    review: '🔍 Tarkistus'
  };
  
  return e('div', { 
    className: 'fixed bottom-4 right-4 text-xs opacity-20 pointer-events-none z-10',
    style: { color: 'var(--mac-text-primary)' }
  }, labels[mode] || '');
};
// NORMAN: Learning Feedback - Shows AI learned from rejection
const LearningFeedback = ({ message, isVisible, onDismiss }) => {
  if (!isVisible) return null;
  
  return e('div', { 
    className: 'fixed top-20 right-4 z-50 animate-slideIn'
  },
    e('div', { 
      className: 'bg-[var(--mac-bg-tertiary)] backdrop-blur-xl rounded-lg px-4 py-3 shadow-xl border border-[rgba(255,255,255,0.1)] max-w-sm'
    },
      e('div', { className: 'flex items-start gap-3' },
        e('div', { 
          className: 'w-6 h-6 rounded-full bg-[var(--mac-accent-purple)] flex items-center justify-center text-xs'
        }, '🧠'),
        e('div', { 
          className: 'text-xs',
          style: { color: 'var(--mac-text-secondary)' }
        }, message),
        e('button', {
          onClick: onDismiss,
          className: 'text-xs opacity-50 hover:opacity-100 transition-opacity ml-2'
        }, '×')
      )
    )
  );
};
// KRUG: Simple Status Bar - Always visible, minimal
const SimpleStatusBar = ({ wordCount, saveStatus }) => {
  const statusIcons = {
    saved: '✓',
    saving: '⏳',
    error: '⚠️'
  };
  
  const statusText = {
    saved: 'Tallennettu',
    saving: 'Tallennetaan...',
    error: 'Virhe tallennuksessa'
  };
  
  return e('div', { 
    className: 'h-8 bg-[var(--mac-bg-secondary)] border-t border-[rgba(255,255,255,0.05)] flex items-center justify-between px-4 text-xs',
    style: { color: 'var(--mac-text-secondary)' }
  },
    e('div', null, `${wordCount || 0} sanaa`),
    e('div', { className: 'flex items-center gap-1' },
      e('span', null, statusIcons[saveStatus]),
      e('span', null, statusText[saveStatus])
    )
  );
};
// NORMAN: Writer-Centric Sidebar Section
const WriterSidebarSection = ({ title, icon, children, defaultExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return e('div', { className: 'mb-4' },
    // Section header - clickable to expand/collapse
    e('button', {
      className: 'w-full px-3 py-2 flex items-center justify-between hover:bg-[rgba(255,255,255,0.05)] transition-colors rounded',
      onClick: () => setIsExpanded(!isExpanded)
    },
      e('div', { 
        className: 'text-[11px] font-semibold uppercase tracking-wide flex items-center gap-2',
        style: { color: 'var(--mac-text-tertiary)' }
      },
        e('span', null, icon),
        e('span', null, title)
      ),
      e('span', { 
        className: 'text-xs',
        style: { color: 'var(--mac-text-tertiary)' }
      }, isExpanded ? '▼' : '▶')
    ),
    
    // Content - collapsible
    isExpanded && e('div', { className: 'px-2 mt-1' }, children)
  );
};

// KRUG: Visual Hierarchy - Primary/Secondary/Tertiary Buttons
const PrimaryButton = ({ children, onClick, className = '', title }) => {
  return e('button', {
    className: `px-4 py-2 rounded-lg font-semibold transition-all ${className}`,
    style: {
      background: 'var(--mac-accent-blue)',
      color: '#ffffff'
    },
    onClick,
    title
  }, children);
};

const SecondaryButton = ({ children, onClick, className = '', title }) => {
  return e('button', {
    className: `px-3 py-1.5 rounded transition-all hover:bg-[rgba(255,255,255,0.08)] ${className}`,
    style: {
      background: 'rgba(255,255,255,0.05)',
      color: 'var(--mac-text-primary)'
    },
    onClick,
    title
  }, children);
};
const TertiaryButton = ({ children, onClick, className = '', title }) => {
  return e('button', {
    className: `px-2 py-1 text-sm rounded transition-opacity hover:opacity-100 opacity-70 ${className}`,
    style: {
      color: 'var(--mac-text-secondary)'
    },
    onClick,
    title
  }, children);
};

// ========== VISUAL MASTERS: UI Components ==========

// IDEO: Cognitive Load Indicator
const CognitiveLoadIndicator = ({ load }) => {
  if (load < 30) return null; // Only show when load is noticeable
  
  const getLoadColor = () => {
    if (load < 50) return '#30d158'; // Green - OK
    if (load < 75) return '#ff9f0a'; // Orange - Moderate
    return '#ff453a'; // Red - High
  };
  
  const getLoadLabel = () => {
    if (load < 50) return 'Kevyt kuorma';
    if (load < 75) return 'Keskitaso';
    return 'Korkea kuorma';
  };
  
  return e('div', {
    className: 'fixed bottom-20 right-4 z-20',
    style: { opacity: 0.6 }
  },
    e('div', {
      className: 'bg-black/50 backdrop-blur-xl rounded-lg px-3 py-2 flex items-center gap-2 text-xs'
    },
      // Load bar
      e('div', {
        className: 'w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden'
      },
        e('div', {
          className: 'h-full transition-all duration-1000',
          style: {
            width: `${load}%`,
            background: getLoadColor()
          }
        })
      ),
      // Label
      e('span', {
        style: { color: getLoadColor() }
      }, getLoadLabel())
    )
  );
};
// SUPERSIDE: Work Phase Indicator
const WorkPhaseIndicator = ({ phase }) => {
  const phaseConfig = {
    drafting: { icon: '🚀', label: 'Luonnostelu', color: '#ff9f0a' },
    writing: { icon: '✍️', label: 'Kirjoitus', color: '#0a84ff' },
    editing: { icon: '✂️', label: 'Muokkaus', color: '#bf5af2' },
    reviewing: { icon: '🔍', label: 'Tarkistus', color: '#30d158' }
  };
  
  const config = phaseConfig[phase] || phaseConfig.writing;
  
  return e('div', {
    className: 'fixed top-20 right-4 z-20',
    style: { opacity: 0.4 }
  },
    e('div', {
      className: 'bg-black/50 backdrop-blur-xl rounded-lg px-3 py-2 flex items-center gap-2 text-xs transition-all duration-1000'
    },
      e('span', { className: 'text-lg' }, config.icon),
      e('span', { style: { color: config.color } }, config.label)
    )
  );
};

// IDEO: Transparent AI Indicator
const TransparentAIIndicator = ({ active, thinking, suggestionCount }) => {
  return e('div', {
    className: 'fixed bottom-4 right-4 z-20'
  },
    e('div', {
      className: 'bg-black/50 backdrop-blur-xl rounded-full px-4 py-2 flex items-center gap-3'
    },
      // Status dot
      e('div', {
        className: `w-2 h-2 rounded-full transition-all ${thinking ? 'animate-pulse' : ''}`,
        style: {
          background: thinking ? '#0a84ff' : active ? '#30d158' : '#6b6b6b'
        }
      }),
      
      // Status text
      e('span', {
        className: 'text-xs',
        style: { color: 'var(--mac-text-secondary)' }
      }, thinking ? 'Analysoin...' : active ? 'Valmis' : 'Lepotila'),
      
      // Suggestion count badge
      suggestionCount > 0 && e('span', {
        className: 'bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full'
      }, suggestionCount)
    )
  );
};

// ========== NORMAN-KRUG-NATSUME: Utility Functions ==========

// NATSUME: Analyze emotional tone of text
const analyzeEmotionalTone = (text) => {
  if (!text || text.length < 50) return 'neutral';
  
  const calmWords = ['rauhallinen', 'hiljainen', 'pehmeä', 'hiljaa', 'tyyni', 'rauha', 'lempeä', 'hidas', 'kevyt'];
  const tenseWords = ['kiireinen', 'jännittävä', 'nopea', 'äkillinen', 'kiihkeä', 'räjähtävä', 'intensiivinen', 'voimakas'];
  
  const lowerText = text.toLowerCase();
  const calmCount = calmWords.filter(word => lowerText.includes(word)).length;
  const tenseCount = tenseWords.filter(word => lowerText.includes(word)).length;
  
  // Check sentence structure too
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / sentences.length;
  
  if (calmCount > tenseCount && avgSentenceLength > 15) return 'calm';
  if (tenseCount > calmCount || avgSentenceLength < 10) return 'tense';
  return 'neutral';
};

// NATSUME: Generate inspiration based on context
const generateInspiration = (context, genre) => {
  const inspirations = {
    psychological_thriller: [
      { type: 'quote', text: 'Hiljaisuus on ääni, joka kuuluu vain sisältä.', author: 'Tietoinen kirjoittaja' },
      { type: 'quote', text: 'Pelko ei ole heikkoutta, vaan keino säilyttää valppaana.', author: 'Psykologinen' },
      { type: 'rhythm', pattern: 'Lyhyt. Lyhyt. Pitkä ja virtaava lause joka antaa hengähdystauon.' }
    ],
    romantic_drama: [
      { type: 'quote', text: 'Rakkaus ei ole se mitä sanomme, vaan se mitä jätämme sanomatta.', author: 'Romanttinen' },
      { type: 'rhythm', pattern: 'Pehmeä aalto. Lempeä liike. Ja lopulta hiljaisuus joka puhuu.' }
    ],
    mystery: [
      { type: 'quote', text: 'Jokainen kysymys paljastaa enemmän kuin vastaus.', author: 'Mysteerio' },
      { type: 'rhythm', pattern: 'Mikä? Miksi? Miten se tapahtui?' }
    ]
  };
  
  const genreInspirations = inspirations[genre] || inspirations.psychological_thriller;
  return genreInspirations[Math.floor(Math.random() * genreInspirations.length)];
};

// KRUG: Terminology mapping - Technical to Writer's language
const WRITER_TERMINOLOGY = {
  'save': 'Tallenna',
  'export': 'Vie',
  'import': 'Tuo',
  'settings': 'Asetukset',
  'preferences': 'Omat valinnat',
  'sync': 'Synkronoi',
  'backup': 'Varmuuskopio',
  'restore': 'Palauta',
  'delete': 'Poista',
  'duplicate': 'Monista',
  'rename': 'Nimeä uudelleen',
  'move': 'Siirrä',
  'edit': 'Muokkaa',
  'view': 'Näytä',
  'hide': 'Piilota',
  'show': 'Näytä',
  'close': 'Sulje',
  'open': 'Avaa'
};

// ========== VISUAL MASTERS: Design System ==========

// PENTAGRAM/BIERUT: Typographic Scale (Golden Ratio 1.618)
const TYPOGRAPHIC_SCALE = {
  xxxl: '44px',   // 44 / 1.618 ≈ 27
  xxl: '27px',    // 27 / 1.618 ≈ 17
  xl: '22px',     // Headline
  lg: '17px',     // Body (base)
  md: '15px',     // Subheadline
  sm: '13px',     // Caption
  xs: '11px'      // Footnote
};

// PENTAGRAM/BIERUT: Spacing Scale (8px base)
const SPACING_SCALE = {
  xxxxl: '96px',  // 12 * 8
  xxxl: '72px',   // 9 * 8
  xxl: '48px',    // 6 * 8
  xl: '32px',    // 4 * 8
  lg: '24px',    // 3 * 8
  md: '16px',    // 2 * 8
  sm: '12px',    // 1.5 * 8
  xs: '8px',     // 1 * 8
  xxs: '4px'     // 0.5 * 8
};

// SUPERSIDE: Comprehensive Design Tokens
const DESIGN_TOKENS = {
  // Typography
  fontFamily: {
    primary: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
    mono: '"SF Mono", Monaco, Menlo, monospace'
  },
  
  fontSize: TYPOGRAPHIC_SCALE,
  
  fontWeight: {
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  },
  
  lineHeight: {
    tight: 1.2,
    snug: 1.3,
    normal: 1.4,
    relaxed: 1.6,
    loose: 1.8
  },
  
  letterSpacing: {
    tight: '-0.02em',
    snug: '-0.01em',
    normal: '0',
    wide: '0.01em',
    wider: '0.02em'
  },
  
  // Spacing
  spacing: SPACING_SCALE,
  
  // Transitions (MOK: Timeless durations)
  transition: {
    instant: '100ms',
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
    verySlow: '1000ms',
    superSlow: '1500ms'
  },
  
  // Easing (Natural, organic)
  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    natural: 'cubic-bezier(0.4, 0.0, 0.2, 1)' // Sagmeister: organic
  }
};

// SAGMEISTER: Emotional color palettes
const EMOTIONAL_COLOR_ARCS = {
  positive: {
    primary: '#ff9f9f',  // Warm pink
    background: 'linear-gradient(180deg, #2a1a1f 0%, #1f0f14 100%)',
    accent: '#ffb3b3'
  },
  negative: {
    primary: '#7c9ef2',  // Cool blue
    background: 'linear-gradient(180deg, #1a1a2a 0%, #0f0f1f 100%)',
    accent: '#92aef7'
  },
  neutral: {
    primary: '#0a84ff',  // Standard blue
    background: 'linear-gradient(180deg, #1e1e1e 0%, #0f0f0f 100%)',
    accent: '#0a84ff'
  },
  intense: {
    primary: '#bf5af2',  // Purple
    background: 'linear-gradient(180deg, #1f1a2a 0%, #14101f 100%)',
    accent: '#d470ff'
  },
  calm: {
    primary: '#30d158',  // Green
    background: 'linear-gradient(180deg, #1a1f1a 0%, #0f140f 100%)',
    accent: '#40e168'
  }
};

// ========== VISUAL MASTERS: Utility Functions ==========

// SAGMEISTER: Analyze emotional arc (enhanced version)
const analyzeEmotionalArc = (text) => {
  if (!text || text.length < 100) return 'neutral';
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const lowerText = text.toLowerCase();
  
  // Word lists for emotional detection
  const positiveWords = ['iloinen', 'onnellinen', 'rauhallinen', 'lämmin', 'valo', 'kaunis', 'rakkaus', 'hymy'];
  const negativeWords = ['surullinen', 'pimeä', 'kylmä', 'synkkä', 'pelottava', 'viha', 'suru', 'kipu'];
  const intenseWords = ['äkillinen', 'räjähtävä', 'voimakas', 'intensiivinen', 'kiihkeä', 'hurja'];
  const calmWords = ['rauhallinen', 'hiljainen', 'tyyni', 'rauha', 'lempeä', 'pehmeä'];
  
  // Count emotional indicators
  const positiveScore = positiveWords.filter(w => lowerText.includes(w)).length;
  const negativeScore = negativeWords.filter(w => lowerText.includes(w)).length;
  const intenseScore = intenseWords.filter(w => lowerText.includes(w)).length;
  const calmScore = calmWords.filter(w => lowerText.includes(w)).length;
  
  // Check sentence structure
  const avgSentenceLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / sentences.length;
  const hasExclamations = (text.match(/!/g) || []).length;
  
  // Determine emotional arc
  if (intenseScore > 2 || hasExclamations > 3) return 'intense';
  if (calmScore > intenseScore && avgSentenceLength > 15) return 'calm';
  if (positiveScore > negativeScore + 2) return 'positive';
  if (negativeScore > positiveScore + 2) return 'negative';
  
  return 'neutral';
};

// SUPERSIDE: Detect work phase from activity
const detectWorkPhase = (metrics) => {
  const { editCount, wordCount, cursorMovements, timeSinceLastEdit } = metrics;
  
  // Many edits, few new words = editing
  if (editCount > 20 && wordCount < 100) return 'editing';
  
  // Lots of new words with flow = drafting
  if (wordCount > 500 && editCount < 10) return 'drafting';
  
  // Many cursor movements, few edits = reviewing
  if (cursorMovements > 50 && editCount < 5) return 'reviewing';
  
  // Default = writing
  return 'writing';
};

// IDEO: Calculate cognitive load
const calculateCognitiveLoad = (factors) => {
  const {
    typingSpeed = 50,
    errorRate = 0,
    timeOnTask = 0,
    pauseFrequency = 0
  } = factors;
  
  // Fast typing = high load (stress)
  const speedFactor = (typingSpeed / 100) * 30;
  
  // Many errors = high load
  const errorFactor = Math.min(errorRate * 0.5, 30);
  
  // Long time = increasing load (fatigue)
  const timeFactor = Math.min((timeOnTask / 60) * 0.2, 20);
  
  // Many pauses = high load (struggling)
  const pauseFactor = Math.min(pauseFrequency * 0.3, 20);
  
  return Math.min(100, speedFactor + errorFactor + timeFactor + pauseFactor);
};

// PENTAGRAM: Calculate optimal font size based on width
const getOptimalFontSize = (containerWidth) => {
  // Optimal: 60-75 characters per line
  // Formula: width / 60 (assuming ~0.5em per character)
  const optimalSize = containerWidth / 45; // ~67 chars at this size
  return Math.max(15, Math.min(20, optimalSize)); // Clamp 15-20px
};

const DEFAULT_TARGETS = Object.freeze({
  project: 80000,
  daily: 1000,
  session: 500
});

const createDefaultProject = () => {
  const baseProject = {
  title: 'Nimetön projekti',
  collections: [],
  targets: { ...DEFAULT_TARGETS },

  // Vaihe 5: Hahmotietokanta
  characters: [],

  // Vaihe 6: Paikkatietokanta
  locations: [],
  genre: 'psychological_thriller', // Kirjan genre
  
  // StoryKeeper: Tarinan rakenne ja kausaalisuus
  story: {
    outline: [],      // Lukujen rakenne
    events: [],       // Keskeiset tapahtumat
    threads: [],      // Juonilangat
    timeline: [],     // Aikajana
    immutable_facts: [] // Faktat jotka eivät voi muuttua
  },
  
  items: [
    {
      id: 1,
      type: 'folder',
      title: 'Käsikirjoitus',
      expanded: true,
      children: [
        { id: 11, type: 'chapter', title: 'Luku 1', content: '', wordCount: 0, notes: '', status: 'draft', label: 'none', tilannekuvat: [] }
      ]
    },
    {
      id: 2,
      type: 'folder',
      title: 'Tutkimus',
      expanded: false,
      children: []
    }
  ]
  };

  return baseProject;
};

const createDefaultSessionStats = () => ({
  startTime: Date.now(),
  startWords: 0,
  currentWords: 0,
  wordsWritten: 0,
  duration: 0
});

const createFreshDailyStats = () => {
  const today = new Date().toISOString().split('T')[0];
  return { date: today, words: 0, sessions: [] };
};
function FaustEditor() {
  console.log('🎨 FaustEditor component rendering...');
  const [project, setProject] = useState(() => createDefaultProject());
  console.log('📦 Project state initialized');
  const projectRef = useRef(project);

  useEffect(() => {
    const saved = localStorage.getItem('kirjoitusstudio_project');
    if (saved) {
      try {
        const loadedProject = JSON.parse(saved);
        setProject(loadedProject);
        StoryContinuityTracker.initializeMemoryFromProject(loadedProject);
      } catch (e) {
        console.error('Failed to load saved project:', e);
      }
    } else {
      StoryContinuityTracker.initializeMemoryFromProject(projectRef.current);
    }
  }, []);

  // v1.4.1: UI Prefs Bootstrap - Apply theme, layout, modes from electron store
  useEffect(() => {
    async function bootstrapUiPrefs() {
      try {
        const res = await window.electronAPI.getUiPrefs();
        if (res?.success) {
          console.log('[UI Prefs] Loaded from electron:', res.data);
          applyUiPrefs(res.data);
        }
      } catch (error) {
        console.error('[UI Prefs] Failed to load:', error);
      }
    }

    function applyUiPrefs(prefs) {
      const root = document.documentElement;
      const body = document.body;

      // Theme (NOX/DEIS)
      const theme = prefs.theme === 'DEIS' ? 'DEIS' : 'NOX';
      root.setAttribute('data-theme', theme);
      console.log(`[UI Prefs] Applied theme: ${theme}`);

      // New Layout (centered paper) - v1.4.1: Sync to React state
      const isNewLayout = !!prefs.newLayout;
      root.setAttribute('data-layout', isNewLayout ? 'new' : 'legacy');
      root.classList.toggle('faust-new-layout', isNewLayout);
      setNewLayout(isNewLayout);  // ← SYNC to React state!
      console.log(`[UI Prefs] New layout: ${isNewLayout ? 'ON' : 'OFF'}`);

      // Focus Mode
      body.classList.toggle('focus-mode', !!prefs.focusMode);
      console.log(`[UI Prefs] Focus mode: ${prefs.focusMode ? 'ON' : 'OFF'}`);

      // Zen Mode
      body.classList.toggle('zen-mode', !!prefs.zenMode);
      console.log(`[UI Prefs] Zen mode: ${prefs.zenMode ? 'ON' : 'OFF'}`);

      // Apply contrast guard after theme change
      if (typeof applyContrastGuard === 'function') {
        setTimeout(() => applyContrastGuard(), 100);
      }
    }

    // Listen for menu changes
    window.electronAPI.onUiPrefsChanged((prefs) => {
      console.log('[UI Prefs] Changed from menu:', prefs);
      applyUiPrefs(prefs);
    });

    // Initial load
    bootstrapUiPrefs();
  }, []);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const [activeItemId, setActiveItemId] = useState(11);
  const activeItemIdRef = useRef(activeItemId);
  useEffect(() => {
    activeItemIdRef.current = activeItemId;
  }, [activeItemId]);
  
  // Auto-check continuity (DEFINE STATE FIRST!)
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);
  const [continuityWarnings, setContinuityWarnings] = useState([]);
  
  // Auto-check continuity when user is typing
  useEffect(() => {
    if (!autoCheckEnabled) {
      setContinuityWarnings([]);
      return;
    }
    
    const activeItem = getActiveItem();
    const content = activeItem?.content || '';
    
    // Skip if content too short
    if (content.length < 100) {
      setContinuityWarnings([]);
      return;
    }
    
    // Debounce: wait 3 seconds after user stops typing
    const timer = setTimeout(async () => {
      const warnings = [];
      
      try {
        // Check characters (silent mode)
        if (project.story?.characters?.length > 0) {
          for (const char of project.story.characters) {
            const result = await window.electronAPI.generateWithAI(
              `Tarkista tämän hahmon jatkuvuus tekstissä. Vastaa VAIN jos havaitset ongelmia.\n\nHahmo: ${char.name}\nTiedot: ${JSON.stringify(char)}\n\nTeksti:\n${content}`
            );
            if (result && result.trim().length > 10) {
              warnings.push(`⚠️ ${char.name}: ${result.substring(0, 100)}`);
            }
          }
        }
        
        // Check story logic (silent mode)
        const storyCheck = await window.electronAPI.generateWithAI(
          `Tarkista tarinan logiikka ja johdonmukaisuus. Vastaa VAIN jos havaitset ristiriitoja.\n\nTeksti:\n${content}`
        );
        if (storyCheck && storyCheck.trim().length > 10) {
          warnings.push(`⚠️ Juoni: ${storyCheck.substring(0, 100)}`);
        }
        
        setContinuityWarnings(warnings);
      } catch (error) {
        console.error('Auto-check failed:', error);
      }
    }, 3000); // 3 seconds debounce
    
    return () => clearTimeout(timer);
  }, [activeItemId, project.items, autoCheckEnabled]);
  
  const [isDarkMode, setIsDarkMode] = useState(true);  // PR1: Default NOX (dark) theme
  const [isTransitioning, setIsTransitioning] = useState(false);  // Faust spec: mode transition
  const [showSidebar, setShowSidebar] = useState(true);
  const [showInspector, setShowInspector] = useState(false);  // Faust spec: default_hidden: true
  const [zenMode, setZenMode] = useState(false);  // Faust spec: Zen Mode (Cmd/Ctrl+Enter)
  const [aiInlineActive, setAiInlineActive] = useState(false);  // Faust spec: /ai inline mode
  
  // PR2: Feature flag for new layout (default: false)
  const [newLayout, setNewLayout] = useState(false);  // NEW_LAYOUT flag
  
  // PR1: Apply theme and contrast guard
  useEffect(() => {
    const theme = isDarkMode ? 'NOX' : 'DEIS';
    document.documentElement.setAttribute('data-theme', theme);
    console.log(`[Theme] Switched to ${theme}`);
    
    // Apply contrast guard after theme change
    if (typeof applyContrastGuard === 'function') {
      setTimeout(() => applyContrastGuard(), 50);
    }
  }, [isDarkMode]);
  
  // v1.4.1: Apply new-layout class when React state changes
  useEffect(() => {
    if (newLayout) {
      document.body.classList.add('new-layout');
      console.log('[Layout] NEW_LAYOUT enabled → Centered paper active');
    } else {
      document.body.classList.remove('new-layout');
      console.log('[Layout] NEW_LAYOUT disabled → Legacy full-width');
    }
  }, [newLayout]);
  const [aiGhostText, setAiGhostText] = useState('');  // Faust spec: ghost text preview
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPanelTab, setAiPanelTab] = useState('chat'); // 'chat', 'quick', 'techniques', 'hybrid'
  const [sidebarWidth, setSidebarWidth] = useState(240); // Resizable sidebar
  const [inspectorWidth, setInspectorWidth] = useState(320); // Resizable inspector
  
  // HybridWritingFlow UI
  const [showHybridModal, setShowHybridModal] = useState(false);
  const [hybridOptions, setHybridOptions] = useState({
    checkFirst: true,
    autoFix: true,
    doubleCheck: false
  });
  const [hybridProgress, setHybridProgress] = useState(null);
  const [hybridResult, setHybridResult] = useState(null);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingInspector, setIsResizingInspector] = useState(false);
  const [viewMode, setViewMode] = useState('editor');
  const [inspectorTab, setInspectorTab] = useState('notes');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCollectionsPanel, setShowCollectionsPanel] = useState(false);
  
  // Quick Actions for selected text
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  
  // REMOVED DUPLICATE - moved above (line ~2545)
  // const [autoCheckEnabled, setAutoCheckEnabled] = useState(false);
  // const [continuityWarnings, setContinuityWarnings] = useState([]);
  
  const [activeCollection, setActiveCollection] = useState(null);
  const [selectedAIApi, setSelectedAIApi] = useState('claude'); // Valittu AI-palvelu
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);
  
  // AI Agents - CharacterKeeper & StoryKeeper
  const [lastCheckTime, setLastCheckTime] = useState(Date.now());
  const [pendingEdits, setPendingEdits] = useState([]); // AI:n ehdottamat muutokset
  
  // Bi-directional links - [[entity]] syntax
  const [hoveredEntity, setHoveredEntity] = useState(null);
  const [entityPosition, setEntityPosition] = useState({ x: 0, y: 0 });
  
  // Template system - /command syntax
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [templateQuery, setTemplateQuery] = useState('');
  const [templatePosition, setTemplatePosition] = useState({ x: 0, y: 0 });
  
  // Inline metadata - #tags and @entities
  const [projectTags, setProjectTags] = useState(new Set());
  const [hoveredTag, setHoveredTag] = useState(null);
  
  // Graph view
  const [showGraphView, setShowGraphView] = useState(false);
  const [graphViewMode, setGraphViewMode] = useState('all'); // 'all', 'characters', 'locations'
  
  // PHASE 2: Timeline / Kanban view
  const [showTimelineView, setShowTimelineView] = useState(false);
  const [timelineViewMode, setTimelineViewMode] = useState('timeline'); // 'timeline', 'kanban'
  
  // PHASE 2: Natural language queries
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [naturalQuery, setNaturalQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showFindDialog, setShowFindDialog] = useState(false);
  const [findMode, setFindMode] = useState('find');
  const [findQuery, setFindQuery] = useState('');
  const [findReplaceValue, setFindReplaceValue] = useState('');
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findMatches, setFindMatches] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  
  // PHASE 3: AI Concept Map
  const [showConceptMap, setShowConceptMap] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState(null);

  // Projektin tavoitteet
  const [targets, setTargets] = useState(() => ({ ...DEFAULT_TARGETS }));

  // Nykyinen kirjoitusistunto
  const [sessionStats, setSessionStats] = useState(() => createDefaultSessionStats());

  // Päivittäiset tilastot (tallennetaan localStorage)
  const [dailyStats, setDailyStats] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem(`dailyStats_${today}`);
    return saved ? JSON.parse(saved) : createFreshDailyStats();
  });

  // Batch processing states
  const [checkFirst, setCheckFirst] = useState(true);
  const [autoFix, setAutoFix] = useState(true);
  const [batchOperation, setBatchOperation] = useState('continuityCheck');
  const [continuityStatus, setContinuityStatus] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [aiProgress, setAiProgress] = useState(null);
  const [batchStartChapter, setBatchStartChapter] = useState(1);
  const [batchEndChapter, setBatchEndChapter] = useState(1);
  const [continuityMode, setContinuityMode] = useState('write');

  // Vaihe 3: Split View & Compose Mode
  const [composeMode, setComposeMode] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [typewriterMode, setTypewriterMode] = useState(false);
  const [splitViewItem, setSplitViewItem] = useState(null); // Toinen dokumentti split view'ssa

  // Vaihe 4: Fonttien mukauttaminen
  const [editorFont, setEditorFont] = useState(() => {
    const saved = localStorage.getItem('editorPreferences');
    return saved ? JSON.parse(saved).editorFont : 'serif';
  });

  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('editorPreferences');
    return saved ? JSON.parse(saved).fontSize : 18;
  });

  const [lineHeight, setLineHeight] = useState(() => {
    const saved = localStorage.getItem('editorPreferences');
    return saved ? JSON.parse(saved).lineHeight : 1.8;
  });

  const [focusMode, setFocusMode] = useState(false);
  const [showWordCount, setShowWordCount] = useState(true);
  const [showTargetSettings, setShowTargetSettings] = useState(false);
  const [showProjectStats, setShowProjectStats] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Vaihe 5: CharacterKeeper - hahmojen jatkuvuuden valvoja
  const [editingCharacter, setEditingCharacter] = useState(null);
  const [showCharacterSheet, setShowCharacterSheet] = useState(false);
  
  // LocationKeeper - paikkojen hallinta
  const [editingLocation, setEditingLocation] = useState(null);
  const [showLocationSheet, setShowLocationSheet] = useState(false);

  // StoryKeeper - tarinan rakenteen hallinta
  const [editingChapter, setEditingChapter] = useState(null);
  const [showChapterSheet, setShowChapterSheet] = useState(false);
  const [editingThread, setEditingThread] = useState(null);
  const [showThreadSheet, setShowThreadSheet] = useState(false);

  // ========== NORMAN-KRUG-NATSUME: UI/UX States ==========
  
  // NATSUME: Flow Modes - Focus, Rhythm, Review
  const [flowMode, setFlowMode] = useState('normal'); // 'normal', 'focus', 'rhythm', 'review'
  const [emotionalTone, setEmotionalTone] = useState('neutral'); // 'calm', 'tense', 'neutral'
  
  // NORMAN: AI Suggestions & Feedback
  const [aiSuggestions, setAiSuggestions] = useState([]); // { id, text, reason, position, type }
  const [showAIFeedback, setShowAIFeedback] = useState(null); // { action, details, type }
  const [activeSuggestion, setActiveSuggestion] = useState(null);
  
  // NATSUME: Inspiration Panel
  const [showInspiration, setShowInspiration] = useState(false);
  const [inspirationData, setInspirationData] = useState(null);
  const [lastEditTime, setLastEditTime] = useState(Date.now());
  
  // NORMAN: Learning System - AI learns from user preferences
  const [userPreferences, setUserPreferences] = useState(() => {
    const saved = localStorage.getItem('aiLearningPreferences');
    return saved ? JSON.parse(saved) : {
      rejectedSuggestions: [],
      preferredStyles: {},
      contextPreferences: {}
    };
  });
  
  // KRUG: Optimistic UI state
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'

  // ========== VISUAL MASTERS: State Management ==========
  
  // SAGMEISTER: Living Typography
  const [writingSpeed, setWritingSpeed] = useState(50); // 0-100, affects font size/spacing
  const [lastKeystroke, setLastKeystroke] = useState(Date.now());
  const [keystrokeCount, setKeystrokeCount] = useState(0);
  
  // SAGMEISTER: Emotional Color Arc
  const [emotionalArc, setEmotionalArc] = useState('neutral'); // 'positive', 'negative', 'neutral', 'intense', 'calm'
  
  // SUPERSIDE: Work Phase Detection
  const [workPhase, setWorkPhase] = useState('writing'); // 'drafting', 'writing', 'editing', 'reviewing'
  const [activityMetrics, setActivityMetrics] = useState({
    editCount: 0,
    wordCount: 0,
    cursorMovements: 0,
    timeSinceLastEdit: 0
  });
  
  // IDEO: Cognitive Load
  const [cognitiveLoad, setCognitiveLoad] = useState(50); // 0-100
  
  // IDEO: AI Transparency
  const [aiTransparency, setAiTransparency] = useState({
    active: false,
    thinking: false,
    context: null
  });

  // Fonttivaihtoehdot
  const fontOptions = [
    { id: 'serif', name: 'Serif (Times)', family: 'Times New Roman, serif' },
    { id: 'sans', name: 'Sans-serif', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    { id: 'mono', name: 'Monospace', family: 'Menlo, Monaco, Consolas, monospace' },
    { id: 'georgia', name: 'Georgia', family: 'Georgia, serif' },
    { id: 'garamond', name: 'Garamond', family: 'Garamond, serif' },
    { id: 'bookman', name: 'Bookman', family: 'Bookman, serif' },
    { id: 'courier', name: 'Courier', family: '"Courier New", Courier, monospace' },
    { id: 'arial', name: 'Arial', family: 'Arial, Helvetica, sans-serif' },
    { id: 'verdana', name: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
    { id: 'tahoma', name: 'Tahoma', family: 'Tahoma, Geneva, sans-serif' },
    // Google Fonts
    { id: 'merriweather', name: 'Merriweather', family: 'Merriweather, serif' },
    { id: 'playfair', name: 'Playfair Display', family: '"Playfair Display", serif' },
    { id: 'lora', name: 'Lora', family: 'Lora, serif' },
    { id: 'opensans', name: 'Open Sans', family: '"Open Sans", sans-serif' },
    { id: 'source', name: 'Source Code Pro', family: '"Source Code Pro", monospace' }
  ];

  const editorRef = useRef(null);
  const findInputRef = useRef(null);
  const findMatchesRef = useRef([]);
  const currentMatchIndexRef = useRef(0);
  const highlightMatch = useCallback((matchIndex, matches) => {
    if (!editorRef.current || !matches.length || !findQuery) return;

    const start = matches[matchIndex];
    if (typeof start !== 'number' || Number.isNaN(start) || start < 0) return;
    const end = start + findQuery.length;

    requestAnimationFrame(() => {
      const textarea = editorRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start, end);
    });
  }, [findQuery]);
  const dictionaryRef = useRef(new Set());
  const [dictionaryStatus, setDictionaryStatus] = useState('loading');
  const [dictionaryError, setDictionaryError] = useState(null);
  const [spellcheckModalOpen, setSpellcheckModalOpen] = useState(false);
  const [spellcheckResults, setSpellcheckResults] = useState([]);
  const [spellcheckLoading, setSpellcheckLoading] = useState(false);
  const computeMatchPositions = useCallback((text, query, isCaseSensitive) => {
    if (!text || !query) return [];

    const haystack = isCaseSensitive ? text : text.toLowerCase();
    const needle = isCaseSensitive ? query : query.toLowerCase();
    if (!needle) return [];

    const matches = [];
    let fromIndex = 0;

    while (fromIndex <= haystack.length) {
      const foundIndex = haystack.indexOf(needle, fromIndex);
      if (foundIndex === -1) break;
      matches.push(foundIndex);
      fromIndex = foundIndex + Math.max(needle.length, 1);
    }

    return matches;
  }, []);


  useEffect(() => {
    let cancelled = false;
    const loadDictionary = async () => {
      try {
        const baseResponse = await fetch('utils/dictionaries/fi-basic.json');
        if (!baseResponse.ok) {
          throw new Error(`HTTP ${baseResponse.status}`);
        }
        const baseWords = await baseResponse.json();
        let combined = Array.isArray(baseWords) ? baseWords : [];

        try {
          const extraResponse = await fetch('utils/dictionaries/fi-expanded.txt');
          if (extraResponse.ok) {
            const extraText = await extraResponse.text();
            const extraWords = extraText
              .split(/\r?\n/)
              .map(word => word.trim())
              .filter(Boolean);
            combined = combined.concat(extraWords);
          }
        } catch (extraError) {
          console.warn('Optional dictionary extension not loaded:', extraError);
        }

        if (cancelled) return;
        dictionaryRef.current = new Set(combined.map(word => (word || '').toLowerCase()));
        setDictionaryStatus('ready');
      } catch (error) {
        if (cancelled) return;
        console.error('Spell-check dictionary load failed:', error);
        setDictionaryError(error.message || 'Tuntematon virhe');
        setDictionaryStatus('error');
      }
    };

    loadDictionary();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusOptions = [
    { value: 'draft', label: 'Luonnos' },
    { value: 'revision', label: 'Korjaus' },
    { value: 'complete', label: 'Valmis' }
  ];

  const aiPrompts = [
    { label: 'Jatka kirjoittamista', prompt: 'Jatka tätä tekstiä luonnollisesti säilyttäen tyylin ja äänen.' },
    { label: 'Paranna kappaletta', prompt: 'Paranna tätä kappaletta säilyttäen sen ydinsisällön.' },
    { label: 'Luo juonikaari', prompt: 'Ehdota juonikaarta tälle luvulle.' },
    { label: 'Kehitä hahmoa', prompt: 'Anna ideoita hahmon kehittämiseen tämän perusteella.' },
    { label: 'Paranna dialogia', prompt: 'Tee dialogista luonnollisempaa ja kiinnostavampaa.' },
    { label: 'Luo jännitettä', prompt: 'Ehdota tapoja lisätä jännitettä tähän kohtaukseen.' }
  ];

  const findInitialActiveId = (items = []) => {
    for (const item of items) {
      if (item.type !== 'folder') {
        return item.id;
      }
      if (item.children && item.children.length > 0) {
        const childId = findInitialActiveId(item.children);
        if (childId) return childId;
      }
    }
    return items[0]?.id || null;
  };

  const findParentId = (items, targetId, parentId = null) => {
    for (const item of items) {
      if (item.id === targetId) return parentId;
      if (item.children) {
        const found = findParentId(item.children, targetId, item.id);
        if (found !== null) return found;
      }
    }
    return null;
  };

  const findItem = (items, id) => {
    for (const item of items) {
      if (item.id === id) return item;
      if (item.children) {
        const found = findItem(item.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const getActiveItem = () => findItem(project.items, activeItemId);
  const getSelectedLocation = () => project.locations?.find(loc => loc.id === editingLocation?.id);
  const countWords = (text) => text.trim().split(/\s+/).filter(word => word.length > 0).length;

  const getTotalWordCount = () => {
    const countRecursive = (items) => items.reduce((sum, item) => {
      let count = sum + (item.wordCount || 0);
      if (item.children) count += countRecursive(item.children);
      return count;
    }, 0);
    return countRecursive(project.items);
  };

  const resetProjectState = useCallback(() => {
    const freshProject = createDefaultProject();
    setProject(freshProject);
    StoryContinuityTracker.initializeMemoryFromProject(freshProject);
    setTargets({ ...DEFAULT_TARGETS });
    const initialId = findInitialActiveId(freshProject.items);
    if (initialId) {
      setActiveItemId(initialId);
    }
    setSessionStats(createDefaultSessionStats());
    setDailyStats(createFreshDailyStats());
    setShowSidebar(true);
    setShowInspector(true);
    setAiAssistantOpen(false);
    setComposeMode(false);
    setFocusMode(false);
    setShowSearchModal(false);
    localStorage.removeItem('kirjoitusstudio_project');
  }, []);

  const applyLoadedProject = useCallback((data) => {
    if (!data) return;
    setProject(data);
    StoryContinuityTracker.initializeMemoryFromProject(data);
    if (data.targets) {
      setTargets({
        project: data.targets.project ?? DEFAULT_TARGETS.project,
        daily: data.targets.daily ?? DEFAULT_TARGETS.daily,
        session: data.targets.session ?? DEFAULT_TARGETS.session
      });
    } else {
      setTargets({ ...DEFAULT_TARGETS });
    }
    const initialId = findInitialActiveId(data.items || []);
    if (initialId) {
      setActiveItemId(initialId);
    }
  }, []);

  const updateItem = (id, updates) => {
    const updateRecursive = (items) => items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, ...updates };
        if (updates.content !== undefined) updatedItem.wordCount = countWords(updates.content);
        return updatedItem;
      }
      if (item.children) return { ...item, children: updateRecursive(item.children) };
      return item;
    });
    setProject({ ...project, items: updateRecursive(project.items) });
  };
  const updateItemRef = useRef(updateItem);
  useEffect(() => {
    updateItemRef.current = updateItem;
  }, [updateItem]);

  // Luo snapshot (tilannekuva)
  const createSnapshot = () => {
    const activeItem = getActiveItem();
    if (!activeItem || !activeItem.content) {
      alert('Ei sisältöä tallennettavaksi!');
      return;
    }

    const snapshot = {
      id: Date.now(),
      title: `Tilannekuva ${new Date().toLocaleString('fi-FI')}`,
      content: activeItem.content,
      timestamp: new Date().toISOString(),
      wordCount: activeItem.wordCount
    };

    updateItem(activeItemId, { snapshots: [...(activeItem.snapshots || []), snapshot] });
    alert('Tilannekuva tallennettu!');
  };

  // Palauta snapshot
  const restoreSnapshot = (snapshot) => {
    if (confirm(`Palauta tilannekuva "${snapshot.title}"? Nykyinen sisältö korvataan.`)) {
      updateItem(activeItemId, { content: snapshot.content });
      if (editorRef.current) editorRef.current.value = snapshot.content;
      alert('Tilannekuva palautettu!');
    }
  };

  // Poista snapshot
  const deleteSnapshot = (snapshotId) => {
    const activeItem = getActiveItem();
    updateItem(activeItemId, { snapshots: (activeItem.snapshots || []).filter(s => s.id !== snapshotId) });
  };

  // Luo uusi kokoelma
  const createCollection = () => {
    const name = prompt('Anna kokoelman nimi:');
    if (!name) return;

    const newCollection = {
      id: Date.now(),
      name,
      itemIds: []
    };

    setProject({ ...project, collections: [...(project.collections || []), newCollection] });
  };
  // Lisää dokumentti kokoelmaan
  const addToCollection = (collectionId, itemId) => {
    setProject({
      ...project,
      collections: project.collections.map(col =>
        col.id === collectionId ? { ...col, itemIds: [...col.itemIds, itemId] } : col
      )
    });
  };

  // Poista dokumentti kokoelmasta
  const removeFromCollection = (collectionId, itemId) => {
    setProject({
      ...project,
      collections: project.collections.map(col =>
        col.id === collectionId ? { ...col, itemIds: col.itemIds.filter(id => id !== itemId) } : col
      )
    });
  };

  const addItem = (parentId, type) => {
    const newId = Date.now();
    const titles = {
      chapter: 'Uusi luku',
      document: 'Uusi dokumentti',
      folder: 'Uusi kansio'
    };

    const newItem = {
      id: newId,
      type,
      title: titles[type] || 'Uusi kohde',
      content: '',
      wordCount: 0,
      notes: '',
      status: 'draft',
      label: 'none',
      tilannekuvat: []
    };

    if (type === 'folder') {
      newItem.children = [];
      newItem.expanded = true;
    }

    const addRecursive = (items) => items.map(item => {
      if (item.id === parentId && item.type === 'folder') {
        return { ...item, children: [...(item.children || []), newItem] };
      }
      if (item.children) return { ...item, children: addRecursive(item.children) };
      return item;
    });

    setProject({ ...project, items: addRecursive(project.items) });
    setActiveItemId(newId);
  };
  const addItemRef = useRef(addItem);
  useEffect(() => {
    addItemRef.current = addItem;
  }, [addItem]);

  const deleteItem = (id) => {
    const deleteRecursive = (items) => items.filter(item => {
      if (item.id === id) return false;
      if (item.children) item.children = deleteRecursive(item.children);
      return true;
    });

    setProject({ ...project, items: deleteRecursive(project.items) });
    if (activeItemId === id) {
      setActiveItemId(project.items[0]?.children?.[0]?.id || project.items[0]?.id);
    }
  };

  const toggleFolder = (id) => {
    const toggleRecursive = (items) => items.map(item => {
      if (item.id === id && item.type === 'folder') {
        return { ...item, expanded: !item.expanded };
      }
      if (item.children) return { ...item, children: toggleRecursive(item.children) };
      return item;
    });
    setProject({ ...project, items: toggleRecursive(project.items) });
  };

  const callAI = useCallback(async (model, prompt, modelOptions = {}) => {
    let result;
    const payload = model === 'deepseek'
      ? { prompt, options: modelOptions }
      : prompt;

    switch (model) {
      case 'claude':
        result = await window.electronAPI.claudeAPI(prompt);
        break;
      case 'grok':
        result = await window.electronAPI.grokAPI(prompt);
        break;
      case 'openai':
        result = await window.electronAPI.openaiAPI(prompt);
        break;
      case 'gemini':
        result = await window.electronAPI.geminiAPI(prompt);
        break;
      case 'cursor':
        result = await window.electronAPI.cursorAPI(prompt);
        break;
      case 'deepseek':
        result = await window.electronAPI.deepseekAPI(payload);
        break;
      default:
        result = await window.electronAPI.claudeAPI(prompt);
    }
    return result;
  }, []);
  useEffect(() => {
    StoryContinuityTracker.configure({
      deepseekClient: async ({ prompt, options }) => {
        const response = await callAI('deepseek', prompt, options || {});
        if (!response?.success) {
          const error = new Error(response?.error || 'DeepSeek request failed');
          throw error;
        }
        return response;
      },
      getProject: () => projectRef.current
    });

    HybridWritingFlow.configure({
      callAI: (model, prompt, options = {}) => callAI(model, prompt, options),
      getProject: () => projectRef.current,
      defaultModel: selectedAIApi
    });

    BatchProcessor.configure({
      getProject: () => projectRef.current,
      setProject: (updatedProject) => {
        if (!updatedProject) return;
        projectRef.current = updatedProject;
        setProject(updatedProject);
      },
      onProgress: (payload) => setBatchProgress(payload)
    });
  }, [callAI, selectedAIApi, setProject]);

  const handleAIProgress = useCallback((payload) => {
    if (!payload) return;
    setAiProgress(payload);
  }, []);

  const getChapterCount = useCallback(() => {
    const story = project?.story || {};
    if (Array.isArray(story.chapters) && story.chapters.length > 0) {
      return story.chapters.length;
    }
    if (Array.isArray(story.outline) && story.outline.length > 0) {
      return story.outline.length;
    }

    const countFromItems = (items) => {
      if (!Array.isArray(items)) return 0;
      return items.reduce((sum, item) => {
        if (!item) return sum;
        const isChapter = item.type === 'chapter' || item.type === 'scene';
        return sum + (isChapter ? 1 : 0) + countFromItems(item.children);
      }, 0);
    };

    const itemCount = countFromItems(project?.items);
    return itemCount || 1;
  }, [project]);

  useEffect(() => {
    const total = Math.max(1, getChapterCount());
    setBatchStartChapter((current) => Math.min(current || 1, total));
    setBatchEndChapter(total);
  }, [getChapterCount]);

  const estimatedNovelCost = useMemo(
    () => CostOptimizer.estimateFullNovelCost({ chapters: getChapterCount() }),
    [getChapterCount]
  );

  const updateEditorContent = useCallback((newContent, selectionStart, selectionEnd, options = {}) => {
    const targetItemId = options.itemId ?? activeItemIdRef.current;
    if (!targetItemId || !updateItemRef.current) return;
    const projectData = projectRef.current;
    if (!projectData) return;
    const targetItem = findItem(projectData.items, targetItemId);
    if (!targetItem) return;
    const previousContent = targetItem.content || '';
    const shouldPushHistory = options.pushHistory !== false && previousContent !== newContent;

    if (shouldPushHistory) {
      undoStackRef.current.push({
        itemId: targetItemId,
        content: previousContent,
        selectionStart: options.previousSelectionStart ?? editorRef.current?.selectionStart ?? 0,
        selectionEnd: options.previousSelectionEnd ?? editorRef.current?.selectionEnd ?? 0
      });
      if (undoStackRef.current.length > HISTORY_LIMIT) {
        undoStackRef.current.splice(0, undoStackRef.current.length - HISTORY_LIMIT);
      }
      redoStackRef.current.length = 0;
    }

    updateItemRef.current(targetItemId, { content: newContent });

    const desiredStart = typeof selectionStart === 'number' ? selectionStart : null;
    const desiredEnd = typeof selectionEnd === 'number'
      ? selectionEnd
      : (typeof selectionStart === 'number' ? selectionStart : null);

    if (targetItemId !== activeItemIdRef.current) {
      pendingSelectionRef.current = {
        start: desiredStart,
        end: desiredEnd
      };
      setActiveItemId(targetItemId);
    } else if (editorRef.current) {
      editorRef.current.value = newContent;
      if (desiredStart !== null) {
        requestAnimationFrame(() => {
          editorRef.current?.focus();
          editorRef.current?.setSelectionRange(
            desiredStart,
            desiredEnd ?? desiredStart
          );
        });
      }
    }
  }, [setActiveItemId]);

  useEffect(() => {
    if (!pendingSelectionRef.current) return;
    const pending = pendingSelectionRef.current;
    pendingSelectionRef.current = null;
    if (editorRef.current && pending.start !== null) {
      requestAnimationFrame(() => {
        editorRef.current?.focus();
        editorRef.current?.setSelectionRange(
          pending.start,
          pending.end ?? pending.start
        );
      });
    }
  }, [activeItemId]);

  // ESC-näppäin sulkee modaalit ja paneelit + Zen Mode toggle
  useEffect(() => {
    const handleKeyboard = (event) => {
      // Faust Spec: Zen Mode (Cmd/Ctrl+Enter)
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setZenMode(prev => !prev);
        console.log('🔑 Cmd/Ctrl+Enter - Zen Mode toggled');
        return;
      }
      
      // PR3: Focus Mode (Cmd/Ctrl+Shift+F)
      if (event.key === 'f' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setViewMode(prev => prev === 'focus' ? 'editor' : 'focus');
        console.log('🔑 Cmd/Ctrl+Shift+F - Focus Mode toggled');
        return;
      }
      
      if (event.key === 'Escape') {
        // Sulje Zen Mode jos päällä
        if (zenMode) {
          setZenMode(false);
          console.log('🔑 ESC pressed - Zen Mode closed');
          return;
        }
        
        // Sulje kaikki modaalit
        setShowCharacterSheet(false);
        setShowLocationSheet(false);
        setShowChapterSheet(false);
        setShowThreadSheet(false);
        setShowCommandPalette(false);
        
        console.log('🔑 ESC pressed - Modals closed');
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    
    // Cleanup: Poista event listener kun komponentti unmount
    return () => {
      window.removeEventListener('keydown', handleKeyboard);
    };
  }, [zenMode]); // zenMode dep lisätty

  const insertAtCursor = useCallback((text) => {
    if (!text) return;
    const projectData = projectRef.current;
    const activeId = activeItemIdRef.current;
    if (!projectData || !activeId) return;
    const activeItem = findItem(projectData.items, activeId) || {};
    const existing = activeItem.content || '';
    const textarea = editorRef.current;
    const selectionStart = textarea?.selectionStart ?? existing.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const newContent = `${existing.slice(0, selectionStart)}${text}${existing.slice(selectionEnd)}`;
    updateEditorContent(newContent, selectionStart + text.length, selectionStart + text.length, {
      previousSelectionStart: selectionStart,
      previousSelectionEnd: selectionEnd,
      itemId: activeId
    });
  }, [updateEditorContent]);

  const downloadMemory = useCallback(() => {
    const payload = StoryContinuityTracker.exportMemory();
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `story-memory-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

  const checkFullStory = useCallback(async () => {
    const total = getChapterCount();
    setBatchProgress(null);
    setAiProgress({ stage: 'check', message: 'Scanning entire story for continuity...' });
    try {
      const result = await BatchProcessor.processFullNovel({
        startChapter: 1,
        endChapter: total,
        operation: 'continuityCheck'
      });
      setContinuityStatus(result.issues || []);
      setAiProgress({ stage: 'check-complete', message: 'Continuity scan complete', summary: result });
      return result.issues || [];
    } catch (error) {
      console.error('Continuity check failed', error);
      setAiProgress({ stage: 'error', message: error.message });
      throw error;
    }
  }, [getChapterCount]);

  const startBatchProcess = useCallback(async () => {
    const total = getChapterCount();
    const normalizedStart = Math.max(1, Math.min(batchStartChapter, total));
    const normalizedEnd = Math.max(normalizedStart, Math.min(batchEndChapter, total));
    setAiProgress({ stage: 'batch-start', message: 'Running batch process...' });
    setBatchProgress({ stage: 'batch-start', current: normalizedStart, total: normalizedEnd });

    try {
      const result = await BatchProcessor.processFullNovel({
        startChapter: normalizedStart,
        endChapter: normalizedEnd,
        operation: batchOperation
      });
      setContinuityStatus(result.issues || []);
      setAiProgress({ stage: 'batch-complete', message: 'Batch process complete', summary: result });
      return result;
    } catch (error) {
      console.error('Batch process failed', error);
      setAiProgress({ stage: 'error', message: error.message });
      throw error;
    }
  }, [batchOperation, batchStartChapter, batchEndChapter, getChapterCount]);

  const resolveActiveChapter = useCallback(() => {
    const projectData = projectRef.current;
    const activeId = activeItemIdRef.current;
    if (projectData && activeId) {
      const activeItem = findItem(projectData.items, activeId);
      if (activeItem?.chapter) return Number(activeItem.chapter);
      if (activeItem?.number) return Number(activeItem.number);
      if (projectData.story?.chapters) {
        const index = projectData.story.chapters.findIndex((ch) => ch.id === activeItem.id);
        if (index >= 0) return index + 1;
      }
    }
    return Math.max(1, getChapterCount());
  }, [getChapterCount]);

  const callAIAPI = async (prompt, includeContext = true) => {
    setIsGenerating(true);
    setAiResponse('');

    try {
      const activeItem = getActiveItem();
      const context = includeContext && activeItem?.content
        ? `\n\nNykyinen sisältö:\n${activeItem.content}`
        : '';

      const fullPrompt = `Olet luova kirjoitusavustaja, joka auttaa kirjailijaa kirjoittamaan kirjaansa suomeksi.\n\n${prompt}${context}\n\nAnna hyödyllistä, luovaa ja rakentavaa apua. Ole konkreettinen ja käytännöllinen. Vastaa AINA suomeksi.`;

      const result = await callAI(selectedAIApi, fullPrompt);

      if (result.success) {
        setAiResponse(result.data);
        if (result.feedback) console.log('Logic feedback:', result.feedback);
      } else {
        setAiResponse(`Vastauksen luominen epäonnistui (${selectedAIApi}): ` + result.error);
      }
    } catch (err) {
      setAiResponse('Vastauksen luominen epäonnistui. Yritä uudelleen.');
    } finally {
      setIsGenerating(false);
    }
  };
  // Replace selected text with new text
  const replaceSelectedText = (newText) => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    const start = selectionRange.start;
    const end = selectionRange.end;
    const currentContent = editor.value;
    
    if (start === end) {
      // No selection - insert at cursor
      const newContent = 
        currentContent.substring(0, start) + 
        newText + 
        currentContent.substring(start);
      
      updateEditorContent(newContent, start + newText.length, start + newText.length);
    } else {
      // Replace selection
      const newContent = 
        currentContent.substring(0, start) + 
        newText + 
        currentContent.substring(end);
      
      updateEditorContent(newContent, start, start + newText.length);
    }
    
    editor.focus();
  };

  // Insert AI response with different modes
  const insertAiResponse = (mode = 'append') => {
    if (!aiResponse) return;
    const activeItem = getActiveItem();
    const existingContent = activeItem?.content || '';
    
    switch (mode) {
      case 'append':
        // Original behavior - add to end
    const addition = (existingContent ? '\n\n' : '') + aiResponse;
    const newContent = existingContent + addition;
    const cursorPos = newContent.length;
        updateEditorContent(newContent, cursorPos, cursorPos);
        break;
        
      case 'replace-selection':
        // Replace selected text
        replaceSelectedText(aiResponse);
        break;
        
      case 'replace-all':
        // Replace entire content
        updateEditorContent(aiResponse, 0, 0);
        break;
        
      case 'at-cursor':
        // Insert at cursor position
        replaceSelectedText(aiResponse);
        break;
    }
    
    setAiResponse('');
    setShowInsertMenu(false);
  };

  // Handle text selection in editor
  const handleTextSelection = () => {
    if (!editorRef.current) return;
    
    const editor = editorRef.current;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    
    setSelectionRange({ start, end });
    
    if (start !== end) {
      const selected = editor.value.substring(start, end);
      setSelectedText(selected);
      setShowQuickActions(true);
    } else {
      setShowQuickActions(false);
      setSelectedText('');
    }
  };

  // Handle Quick Action (Improve, Shorten, Expand, Fix)
  const handleQuickAction = async (action) => {
    if (!selectedText) return;
    
    const prompts = {
      improve: `Paranna tätä tekstiä tyylillisesti ja sujuvuudeltaan, säilytä merkitys:\n\n${selectedText}`,
      shorten: `Lyhennä tämä teksti noin puoleen, säilytä ydinsisältö ja tärkeimmät asiat:\n\n${selectedText}`,
      expand: `Laajenna tämä teksti lisäämällä yksityiskohtia, kuvausta ja syvyyttä:\n\n${selectedText}`,
      fix: `Korjaa kielioppi- ja tyylvirheet tästä tekstistä:\n\n${selectedText}`
    };
    
    setShowQuickActions(false);
    setAiAssistantOpen(true);
    
    // Call AI with the prompt
    await callAIAPI(prompts[action], false);
  };

  const saveProject = async () => {
    // Aseta tallennustila: saving
    setSaveStatus('saving');
    setShowSaveIndicator(true);
    
    try {
    const projectWithAll = {
      ...project,
      targets,
      characters: project.characters || [], // Varmista että hahmot tallennetaan
      locations: project.locations || [], // Varmista että paikat tallennetaan
      genre: project.genre || 'psychological_thriller', // Varmista että genre tallennetaan
      story: project.story || { outline: [], events: [], threads: [], timeline: [], immutable_facts: [] } // Varmista että tarina tallennetaan
    };
    const result = await window.electronAPI.saveProject(projectWithAll);
      
    if (result.success) {
        // Aseta tallennustila: saved
        setSaveStatus('saved');
        
        // Piilota indikaattori 2 sekunnin kuluttua
        setTimeout(() => {
          setShowSaveIndicator(false);
        }, 2000);
        
        console.log('✅ Projekti tallennettu onnistuneesti');
      } else {
        // Tallennus epäonnistui
        setSaveStatus('error');
        console.error('❌ Tallennusvirhe:', result.error);
        
        // Näytä virhe 3 sekuntia
        setTimeout(() => {
          setShowSaveIndicator(false);
        }, 3000);
      }
    } catch (error) {
      // Odottamaton virhe
      setSaveStatus('error');
      console.error('❌ Tallennusvirhe:', error);
      
      // Näytä virhe 3 sekuntia
      setTimeout(() => {
        setShowSaveIndicator(false);
      }, 3000);
    }
  };

  const loadProject = async () => {
    const result = await window.electronAPI.loadProject();
    if (result.success) {
      applyLoadedProject(result.data);
      alert('Projekti ladattu!');
    }
  };

  const exportDocument = async (format) => {
    const activeItem = getActiveItem();
    if (!activeItem || !activeItem.content) {
      alert('Ei sisältöä vietäväksi!');
      return;
    }

    if (format === 'pdf') {
      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${activeItem.title}</title>
<style>body{font-family:'Times New Roman',serif;max-width:800px;margin:40px auto;line-height:1.6;padding:20px;}
h1{font-size:28px;margin-bottom:20px;}p{margin-bottom:15px;text-align:justify;}</style></head>
<body><h1>${activeItem?.title}</h1>${activeItem?.content?.split('\n\n').map(p => `<p>${p}</p>`).join('')}</body></html>`;

      const result = await window.electronAPI.exportPDF({ html, title: activeItem?.title });
      if (result.success) alert('PDF viety onnistuneesti!');
    } else {
      const result = await window.electronAPI.exportDocument({
        content: activeItem?.content,
        title: activeItem?.title,
        format
      });
      if (result.success) alert(`Dokumentti viety ${format.toUpperCase()}-muodossa!`);
    }
    setShowExportMenu(false);
  };

  const exportFullProject = async (format) => {
    const result = await window.electronAPI.exportFullProject({ project, format });
    if (result.success) {
      alert(`Koko projekti viety ${format.toUpperCase()}-muodossa!`);
    }
    setShowExportMenu(false);
  };

  const saveProjectRef = useRef(saveProject);
  useEffect(() => {
    saveProjectRef.current = saveProject;
  }, [saveProject]);

  const exportDocumentRef = useRef(exportDocument);
  useEffect(() => {
    exportDocumentRef.current = exportDocument;
  }, [exportDocument]);

  const exportFullProjectRef = useRef(exportFullProject);
  useEffect(() => {
    exportFullProjectRef.current = exportFullProject;
  }, [exportFullProject]);

  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const pendingSelectionRef = useRef(null);
  const HISTORY_LIMIT = 200;

  const performUndo = useCallback(() => {
    const undoStack = undoStackRef.current;
    if (!undoStack.length) {
      return;
    }
    const snapshot = undoStack.pop();
    const projectData = projectRef.current;
    if (!snapshot || !projectData) return;

    const activeId = activeItemIdRef.current;
    if (activeId) {
      const currentItem = findItem(projectData.items, activeId);
      if (currentItem) {
        redoStackRef.current.push({
          itemId: activeId,
          content: currentItem.content || '',
          selectionStart: editorRef.current?.selectionStart ?? 0,
          selectionEnd: editorRef.current?.selectionEnd ?? 0
        });
        if (redoStackRef.current.length > HISTORY_LIMIT) {
          redoStackRef.current.splice(0, redoStackRef.current.length - HISTORY_LIMIT);
        }
      }
    }

    updateEditorContent(
      snapshot.content,
      snapshot.selectionStart ?? 0,
      snapshot.selectionEnd ?? snapshot.selectionStart ?? 0,
      { pushHistory: false, itemId: snapshot.itemId }
    );
  }, [updateEditorContent]);

  const performRedo = useCallback(() => {
    const redoStack = redoStackRef.current;
    if (!redoStack.length) {
      return;
    }
    const snapshot = redoStack.pop();
    const projectData = projectRef.current;
    if (!snapshot || !projectData) return;

    const activeId = activeItemIdRef.current;
    if (activeId) {
      const currentItem = findItem(projectData.items, activeId);
      if (currentItem) {
        undoStackRef.current.push({
          itemId: activeId,
          content: currentItem.content || '',
          selectionStart: editorRef.current?.selectionStart ?? 0,
          selectionEnd: editorRef.current?.selectionEnd ?? 0
        });
        if (undoStackRef.current.length > HISTORY_LIMIT) {
          undoStackRef.current.splice(0, undoStackRef.current.length - HISTORY_LIMIT);
        }
      }
    }

    updateEditorContent(
      snapshot.content,
      snapshot.selectionStart ?? 0,
      snapshot.selectionEnd ?? snapshot.selectionStart ?? 0,
      { pushHistory: false, itemId: snapshot.itemId }
    );
  }, [updateEditorContent]);

  const openFindDialog = useCallback((mode = 'find') => {
    setFindMode(mode);
    if (mode === 'replace') {
      setFindReplaceValue(prev => (prev ? prev : (findQuery || '')));
    }
    setShowFindDialog(true);
    requestAnimationFrame(() => {
      if (findInputRef.current) {
        findInputRef.current.focus();
        findInputRef.current.select();
      }
    });
  }, [findQuery]);

  const closeFindDialog = useCallback(() => {
    setShowFindDialog(false);
  }, []);

  const goToMatch = useCallback((direction = 1) => {
    const matches = findMatchesRef.current;
    if (!matches.length) return;
    setCurrentMatchIndex(prev => {
      const length = matches.length;
      const next = ((prev + direction) % length + length) % length;
      return next;
    });
  }, []);

  const goToNextMatch = useCallback(() => goToMatch(1), [goToMatch]);
  const goToPreviousMatch = useCallback(() => goToMatch(-1), [goToMatch]);

  const replaceCurrentMatch = useCallback(() => {
    if (!findQuery) return;
    const matches = findMatchesRef.current;
    if (!matches.length) return;
    const projectData = projectRef.current;
    const activeId = activeItemIdRef.current;
    if (!projectData || !activeId) return;
    const activeItem = findItem(projectData.items, activeId);
    if (!activeItem) return;
    const content = activeItem.content || '';
    const matchStart = matches[currentMatchIndexRef.current] ?? matches[0];
    if (matchStart === undefined) return;
    const matchEnd = matchStart + findQuery.length;
    const newContent = `${content.slice(0, matchStart)}${findReplaceValue}${content.slice(matchEnd)}`;
    const newCursor = matchStart + findReplaceValue.length;
    updateEditorContent(newContent, newCursor, newCursor, {
      previousSelectionStart: matchStart,
      previousSelectionEnd: matchEnd
    });
  }, [findQuery, findReplaceValue, updateEditorContent]);

  const replaceAllMatches = useCallback(() => {
    if (!findQuery) return;
    const matches = findMatchesRef.current;
    if (!matches.length) return;
    const projectData = projectRef.current;
    const activeId = activeItemIdRef.current;
    if (!projectData || !activeId) return;
    const activeItem = findItem(projectData.items, activeId);
    if (!activeItem) return;
    const content = activeItem.content || '';
    const flags = findCaseSensitive ? 'g' : 'gi';
    const regex = new RegExp(escapeRegExp(findQuery), flags);
    regex.lastIndex = 0;
    if (!regex.test(content)) return;
    regex.lastIndex = 0;
    const currentSelectionStart = editorRef.current?.selectionStart ?? 0;
    const currentSelectionEnd = editorRef.current?.selectionEnd ?? currentSelectionStart;
    const newContent = content.replace(regex, (match) => {
      if (!findCaseSensitive && match === match.toUpperCase()) return findReplaceValue.toUpperCase();
      if (!findCaseSensitive && match[0] === match[0].toUpperCase()) {
        return findReplaceValue.charAt(0).toUpperCase() + findReplaceValue.slice(1);
      }
      return findReplaceValue;
    });
    const firstMatch = matches[0] ?? 0;
    const cursorPos = firstMatch + findReplaceValue.length;
    updateEditorContent(newContent, cursorPos, cursorPos, {
      previousSelectionStart: currentSelectionStart,
      previousSelectionEnd: currentSelectionEnd
    });
    setCurrentMatchIndex(0);
  }, [findCaseSensitive, findQuery, findReplaceValue, updateEditorContent]);

  useEffect(() => {
    const projectData = projectRef.current;
    const activeId = activeItemIdRef.current;
    if (!findQuery || !projectData || !activeId) {
      setFindMatches([]);
      setCurrentMatchIndex(0);
      return;
    }
    const activeItem = findItem(projectData.items, activeId);
    if (!activeItem?.content) {
      setFindMatches([]);
      setCurrentMatchIndex(0);
      return;
    }
    const matches = computeMatchPositions(activeItem.content, findQuery, findCaseSensitive);
    setFindMatches(matches);
    if (matches.length === 0) {
      setCurrentMatchIndex(0);
    } else {
      setCurrentMatchIndex(prev => Math.min(prev, matches.length - 1));
    }
  }, [findQuery, findCaseSensitive, project.items, activeItemId, computeMatchPositions]);

  useEffect(() => {
    findMatchesRef.current = findMatches;
  }, [findMatches]);

  useEffect(() => {
    currentMatchIndexRef.current = currentMatchIndex;
  }, [currentMatchIndex]);

  useEffect(() => {
    if (!findMatches.length || !findQuery) return;
    const safeIndex = Math.min(currentMatchIndex, findMatches.length - 1);
    highlightMatch(safeIndex, findMatches);
  }, [currentMatchIndex, findMatches, findQuery, highlightMatch]);

  const getSuggestions = useCallback((word) => {
    const dictionary = dictionaryRef.current;
    if (!dictionary || dictionary.size === 0) return [];
    const lowerWord = (word || '').toLowerCase();
    const suggestions = [];
    dictionary.forEach(candidate => {
      const distance = levenshtein(lowerWord, candidate);
      if (distance <= 2) {
        suggestions.push({ candidate, distance });
      }
    });
    suggestions.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.candidate.localeCompare(b.candidate);
    });
    return suggestions.slice(0, 5).map(item => item.candidate);
  }, []);

  const performSpellCheck = useCallback(() => {
    if (dictionaryStatus === 'loading') {
      alert('Sanakirja latautuu, yritä hetken päästä.');
      return;
    }
    if (dictionaryStatus === 'error') {
      alert('Sanakirjan lataus epäonnistui. ' + (dictionaryError || ''));
      return;
    }
    const projectData = projectRef.current;
    const activeId = activeItemIdRef.current;
    if (!projectData || !activeId) {
      alert('Valitse dokumentti tarkistusta varten.');
      return;
    }
    const activeItem = findItem(projectData.items, activeId);
    if (!activeItem?.content) {
      alert('Ei sisältöä tarkistettavaksi.');
      return;
    }
    const content = activeItem.content || '';
    setSpellcheckLoading(true);
    requestAnimationFrame(() => {
      const tokens = content.toLowerCase().match(/\p{L}+/gu) || [];
      const counts = new Map();
      tokens.forEach(token => {
        if (token.length <= 2) return;
        if (!dictionaryRef.current.has(token)) {
          counts.set(token, (counts.get(token) || 0) + 1);
        }
      });
      const results = Array.from(counts.entries()).map(([word, count]) => ({
        word,
        count,
        suggestions: getSuggestions(word)
      }));
      setSpellcheckResults(results);
      setSpellcheckModalOpen(true);
      setSpellcheckLoading(false);
    });
  }, [dictionaryError, dictionaryStatus, getSuggestions]);

  const replaceMisspelling = useCallback((word, replacement) => {
    if (!word || !replacement) return;
    const projectData = projectRef.current;
    const activeId = activeItemIdRef.current;
    if (!projectData || !activeId) return;
    const activeItem = findItem(projectData.items, activeId);
    if (!activeItem) return;
    const content = activeItem.content || '';
    const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
    let replaced = false;
    const newContent = content.replace(regex, (match) => {
      replaced = true;
      if (match === match.toUpperCase()) return replacement.toUpperCase();
      if (match[0] === match[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
    if (!replaced) return;
    const previousStart = editorRef.current?.selectionStart ?? 0;
    const previousEnd = editorRef.current?.selectionEnd ?? previousStart;
    updateEditorContent(newContent, previousStart, previousStart, {
      previousSelectionStart: previousStart,
      previousSelectionEnd: previousEnd
    });
    setSpellcheckModalOpen(false);
  }, [updateEditorContent]);

  const focusEditor = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const appendTextToActiveItem = useCallback((text) => {
    if (!text) return;
    const projectData = projectRef.current;
    const activeId = activeItemIdRef.current;
    if (!projectData || !activeId) return;
    const activeItem = findItem(projectData.items, activeId);
    const existingContent = activeItem?.content || '';
    const textarea = editorRef.current;
    const previousStart = textarea?.selectionStart ?? existingContent.length;
    const previousEnd = textarea?.selectionEnd ?? previousStart;
    const newContent = existingContent + text;
    const cursorPos = newContent.length;
    updateEditorContent(newContent, cursorPos, cursorPos, {
      previousSelectionStart: previousStart,
      previousSelectionEnd: previousEnd
    });
  }, [updateEditorContent]);

  const applyInlineFormatting = useCallback((type, options = {}) => {
    const textarea = editorRef.current;
    const projectData = projectRef.current;
    const activeId = activeItemIdRef.current;
    if (!textarea || !projectData || !activeId) return;
    const activeItem = findItem(projectData.items, activeId);
    if (!activeItem) return;

    const text = activeItem.content || '';
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;
    const selection = text.slice(start, end);
    let newContent = text;
    let newSelectionStart = start;
    let newSelectionEnd = end;

    const wrapSelection = (prefix, suffix = prefix, placeholder = 'teksti') => {
      if (selection.length === 0) {
        const insertion = `${prefix}${placeholder}${suffix}`;
        newContent = text.slice(0, start) + insertion + text.slice(end);
        newSelectionStart = start + prefix.length;
        newSelectionEnd = newSelectionStart + placeholder.length;
      } else {
        const wrapped = `${prefix}${selection}${suffix}`;
        newContent = text.slice(0, start) + wrapped + text.slice(end);
        newSelectionStart = start + prefix.length;
        newSelectionEnd = newSelectionStart + selection.length;
      }
    };

    const applyLinePrefix = (prefix) => {
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = text.indexOf('\n', end);
      const effectiveEnd = lineEnd === -1 ? text.length : lineEnd;
      const targetText = text.slice(lineStart, effectiveEnd);
      const lines = targetText.split('\n').map(line => (line.startsWith(prefix) ? line : `${prefix}${line}`));
      const replaced = lines.join('\n');
      newContent = text.slice(0, lineStart) + replaced + text.slice(effectiveEnd);
      const cursorOffset = lineStart + replaced.length;
      newSelectionStart = cursorOffset;
      newSelectionEnd = cursorOffset;
    };

    const applyHeading = (level) => {
      const headingLevel = Math.min(Math.max(level || 1, 1), 6);
      const hashes = '#'.repeat(headingLevel);
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = text.indexOf('\n', end);
      const effectiveEnd = lineEnd === -1 ? text.length : lineEnd;
      const line = text.slice(lineStart, effectiveEnd).replace(/^#{1,6}\s*/, '').trimStart();
      const newLine = `${hashes} ${line}`;
      newContent = text.slice(0, lineStart) + newLine + text.slice(effectiveEnd);
      const cursorPos = lineStart + newLine.length;
      newSelectionStart = cursorPos;
      newSelectionEnd = cursorPos;
    };

    switch (type) {
      case 'bold':
        wrapSelection('**', '**', 'vahva teksti');
        break;
      case 'italic':
        wrapSelection('*', '*', 'kursivoitu teksti');
        break;
      case 'underline':
        wrapSelection('__', '__', 'alleviivattu teksti');
        break;
      case 'heading':
        applyHeading(options.level || 1);
        break;
      case 'quote':
        applyLinePrefix('> ');
        break;
      case 'list': {
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = text.indexOf('\n', end);
        const effectiveEnd = lineEnd === -1 ? text.length : lineEnd;
        const targetText = text.slice(lineStart, effectiveEnd);
        const lines = targetText.split('\n').map(line => {
          if (!line.trim()) return line;
          return line.startsWith('- ') ? line : `- ${line}`;
        });
        const replaced = lines.join('\n');
        newContent = text.slice(0, lineStart) + replaced + text.slice(effectiveEnd);
        const cursorPos = lineStart + replaced.length;
        newSelectionStart = cursorPos;
        newSelectionEnd = cursorPos;
        break;
      }
      default:
        return;
    }

    updateEditorContent(newContent, newSelectionStart, newSelectionEnd, {
      previousSelectionStart: start,
      previousSelectionEnd: end
    });
  }, [updateEditorContent]);

  const handleAddItemFromMenu = (type) => {
    if (!addItemRef.current) return;
    const currentProject = projectRef.current;
    if (!currentProject || !currentProject.items?.length) return;

    const activeId = activeItemIdRef.current;
    let parentId = currentProject.items[0].id;

    if (activeId) {
      const activeItem = findItem(currentProject.items, activeId);
      if (activeItem?.type === 'folder') {
        parentId = activeItem.id;
      } else {
        const parent = findParentId(currentProject.items, activeId);
        if (parent) parentId = parent;
      }
    }

    addItemRef.current(parentId, type);
  };
  const handleMenuAction = useCallback(async (action, payload) => {
    switch (action) {
      case 'new-project':
        resetProjectState();
        break;
      case 'save-project-trigger':
      case 'save-project-as-trigger':
        if (saveProjectRef.current) {
          try {
            await saveProjectRef.current();
          } catch (error) {
            console.error('[Menu] Project save failed:', error);
          }
        }
        break;
      case 'export-trigger':
        if (typeof payload === 'string' && exportDocumentRef.current) {
          try {
            await exportDocumentRef.current(payload);
          } catch (error) {
            console.error('[Menu] Export failed:', error);
          }
        }
        break;
      case 'export-pdf-trigger':
        if (exportDocumentRef.current) {
          try {
            await exportDocumentRef.current('pdf');
          } catch (error) {
            console.error('[Menu] PDF export failed:', error);
          }
        }
        break;
      case 'load-project-data':
        applyLoadedProject(payload);
        break;
      case 'undo':
        focusEditor();
        performUndo();
        break;
      case 'redo':
        focusEditor();
        performRedo();
        break;
      case 'show-find':
        openFindDialog('find');
        break;
      case 'find-next':
        if (!findQuery) {
          openFindDialog('find');
        } else {
          goToNextMatch();
        }
        break;
      case 'show-find-replace':
        openFindDialog('replace');
        break;
      case 'toggle-sidebar':
        setShowSidebar(prev => !prev);
        break;
      case 'toggle-inspector':
        setShowInspector(prev => !prev);
        break;
      case 'toggle-ai-panel':
        setAiAssistantOpen(prev => !prev);
        break;
      case 'toggle-focus-mode':
        setComposeMode(prev => !prev);
        setFocusMode(prev => !prev);
        break;
      case 'new-chapter':
        handleAddItemFromMenu('chapter');
        break;
      case 'new-scene':
        handleAddItemFromMenu('chapter');
        break;
      case 'insert-comment':
        appendTextToActiveItem('\n[Kommentti]\n');
        break;
      case 'insert-note':
        appendTextToActiveItem('\n[Muistiinpano]\n');
        break;
      case 'insert-text':
        if (typeof payload === 'string') {
          appendTextToActiveItem(payload);
        }
        break;
      case 'format-bold':
        applyInlineFormatting('bold');
        break;
      case 'format-italic':
        applyInlineFormatting('italic');
        break;
      case 'format-underline':
        applyInlineFormatting('underline');
        break;
      case 'format-heading':
        applyInlineFormatting('heading', { level: typeof payload === 'number' ? payload : 1 });
        break;
      case 'format-quote':
        applyInlineFormatting('quote');
        break;
      case 'format-list':
        applyInlineFormatting('list');
        break;
      case 'show-word-count':
        setShowWordCount(true);
        break;
      case 'show-target-settings':
        setShowTargetSettings(true);
        break;
      case 'spell-check':
        performSpellCheck();
        break;
      case 'show-project-stats':
        setShowProjectStats(true);
        break;
      case 'show-help':
        setShowHelp(true);
        break;
      case 'show-shortcuts':
        setShowShortcuts(true);
        break;
      case 'show-about':
        setShowAbout(true);
        break;
      case 'show-settings':
        setShowSettings(true);
        break;
      case 'ai-suggest':
        setAiPrompt(`AI-ehdotus valitulle tekstille: ${payload}`);
        setAiAssistantOpen(true);
        break;
      default:
        console.info('[Menu] Unhandled action:', action, payload);
    }
  }, [
    appendTextToActiveItem,
    applyInlineFormatting,
    applyLoadedProject,
    findQuery,
    focusEditor,
    goToNextMatch,
    openFindDialog,
    performRedo,
    performSpellCheck,
    performUndo,
    resetProjectState
  ]);

  useEffect(() => {
    if (!window?.electronAPI?.onMenuAction) return;
    const listener = (event, payload) => {
      handleMenuAction(event, payload);
    };
    window.electronAPI.onMenuAction(listener);
  }, [handleMenuAction]);

  const renderTree = (items, depth = 0) => items.map(item => {
    const labelColor = LABEL_COLORS.find(l => l.id === (item.label || 'none'));
    const isActive = activeItemId === item.id;

    return e('div', { key: item.id },
      e('button', {
        className: 'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all cursor-pointer',
        style: {
          paddingLeft: `${depth * 16 + 12}px`,
          background: isActive ? 'var(--mac-accent-blue)' : 'transparent',
          color: isActive ? 'white' : 'var(--mac-text-primary)',
          borderLeft: labelColor && labelColor.id !== 'none' ? `2px solid ${labelColor.color}` : 'none'
        },
        onMouseEnter: (e) => {
          if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
        },
        onMouseLeave: (e) => {
          if (!isActive) e.currentTarget.style.background = 'transparent';
        },
        onClick: () => setActiveItemId(item.id)
      },
        item.type === 'folder' && e('span', {
          onClick: (ev) => { ev.stopPropagation(); toggleFolder(item.id); },
          className: 'flex items-center justify-center w-4'
        }, item.expanded ? e(Icons.ChevronDown, { className: 'w-3 h-3' }) : e(Icons.ChevronRight, { className: 'w-3 h-3' })),
        item.type === 'folder' ? e(Icons.Folder, { className: 'w-4 h-4' }) : e(Icons.FileText, { className: 'w-4 h-4' }),
        e('span', { className: 'flex-1 text-left truncate' }, item.title),
        item.wordCount > 0 && e('span', {
          className: 'text-[11px] font-mono tabular-nums',
          style: { color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--mac-text-tertiary)' }
        }, item.wordCount)
      ),
      item.type === 'folder' && item.expanded && item.children && renderTree(item.children, depth + 1)
    );
  });

  useEffect(() => {
    if (editorRef.current) {
      const chapter = getActiveItem();
      editorRef.current.value = chapter?.content || '';
    }
  }, [activeItemId]);

  // Vaihe 3: Näppäimistöoikotiet
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Cmd/Ctrl + F11: Compose Mode
      if ((event.metaKey || event.ctrlKey) && event.key === 'F11') {
        event.preventDefault();
        setComposeMode(!composeMode);
      }

      // Cmd/Ctrl + \: Split View
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault();
        setSplitView(!splitView);
        if (!splitView) {
          // Valitse toinen dokumentti split view'hun
          const items = [];
          const collectItems = (nodes) => {
            nodes.forEach(node => {
              if (node.type !== 'folder') items.push(node);
              if (node.children) collectItems(node.children);
            });
          };
          collectItems(project.items);
          const otherItems = items.filter(item => item.id !== activeItemId);
          if (otherItems.length > 0) {
            setSplitViewItem(otherItems[0]);
          }
        }
      }

      // Cmd/Ctrl + Shift + T: Typewriter Mode
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'T') {
        event.preventDefault();
        setTypewriterMode(!typewriterMode);
      }
      
      // Cmd/Ctrl + K: Command Palette
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setShowCommandPalette(true);
        setCommandQuery('');
      }
      
      // Escape: Close Command Palette
      if (event.key === 'Escape' && showCommandPalette) {
        event.preventDefault();
        setShowCommandPalette(false);
        setCommandQuery('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [composeMode, splitView, typewriterMode, activeItemId, project.items, showCommandPalette]);

  // Istunnon seuranta
  useEffect(() => {
    // Aloita istunto jos ensimmäinen
    if (sessionStats.startWords === 0) {
      setSessionStats(prev => ({
        ...prev,
        startWords: getTotalWordCount()
      }));
    }

    // Päivitä istunnon tilastot
    const interval = setInterval(() => {
      const currentTotal = getTotalWordCount();
      const written = currentTotal - sessionStats.startWords;
      const duration = Math.floor((Date.now() - sessionStats.startTime) / 1000);

      setSessionStats(prev => ({
        ...prev,
        currentWords: currentTotal,
        wordsWritten: written,
        duration: duration
      }));

      // Päivitä päivätilastot
      setDailyStats(prev => {
        const updated = { ...prev, words: prev.words + written };
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem(`dailyStats_${today}`, JSON.stringify(updated));
        return updated;
      });
    }, 5000); // Päivitä 5 sekunnin välein

    return () => clearInterval(interval);
  }, [getTotalWordCount()]);

  // Vaihe 4: Tallenna fonttipreferenssit localStorageen
  useEffect(() => {
    const preferences = { editorFont, fontSize, lineHeight };
    localStorage.setItem('editorPreferences', JSON.stringify(preferences));
  }, [editorFont, fontSize, lineHeight]);
  // Automaattinen jatkuvuustarkistus (debounced)
  useEffect(() => {
    if (!autoCheckEnabled) return;
    
    const activeItem = getActiveItem();
    if (!activeItem || activeItem.type !== 'chapter') return;
    
    // Debounce: Tarkista vain jos ei muutoksia 10 sekuntiin
    const timeSinceLastCheck = Date.now() - lastCheckTime;
    if (timeSinceLastCheck < 10000) return;
    
    const timer = setTimeout(async () => {
      // Kerää kaikki hahmot jotka mainitaan tekstissä
      const content = activeItem?.content || '';
      const mentionedCharacters = project.characters.filter(char => 
        content.toLowerCase().includes(char.name.toLowerCase())
      );
      
      if (mentionedCharacters.length === 0) return;
      
      const warnings = [];
      
      // Aja CharacterKeeper jokaiselle hahmolle
      for (const char of mentionedCharacters) {
        const analysis = await runCharacterKeeper(content, char);
        if (analysis && analysis.issues && analysis.issues.length > 0) {
          warnings.push({
            agent: 'CharacterKeeper',
            character: char.name,
            issues: analysis.issues,
            timestamp: Date.now()
          });
        }
      }
      
      setContinuityWarnings(warnings);
      setLastCheckTime(Date.now());
    }, 10000); // 10 sekunnin viive
    
    return () => clearTimeout(timer);
  }, [activeItemId, project.items, autoCheckEnabled, lastCheckTime]);

  // macOS System Theme Sync
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const updateTheme = (e) => {
      setIsDarkMode(e.matches);
    };
    
    // Set initial theme
    updateTheme(mediaQuery);
    
    // Listen for changes
    mediaQuery.addEventListener('change', updateTheme);
    
    return () => mediaQuery.removeEventListener('change', updateTheme);
  }, []);
  // macOS Keyboard Shortcuts
  useEffect(() => {
    const handleKeyboard = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      
      const key = e.key.toLowerCase();

      // Cmd+S: Save
      if (mod && key === 's') {
        e.preventDefault();
        saveProject();
      }

      // Cmd+B: Toggle Sidebar
      if (mod && key === 'b') {
        e.preventDefault();
        setShowSidebar(prev => !prev);
      }

      // Cmd+Option+I: Toggle Inspector
      if (mod && e.altKey && key === 'i') {
        e.preventDefault();
        setShowInspector(prev => !prev);
      }

      // Cmd+K: AI Assistant
      if (mod && key === 'k') {
        e.preventDefault();
        setAiAssistantOpen(prev => !prev);
      }

      // Cmd+Shift+F: Focus Mode
      if (mod && e.shiftKey && key === 'f') {
        e.preventDefault();
        setComposeMode(prev => !prev);
      }

      // Cmd+Z / Cmd+Shift+Z: Undo / Redo
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          performRedo();
        } else {
          performUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [performRedo, performUndo, saveProject]);

  // ========== NORMAN-KRUG-NATSUME: Effects ==========
  
  // NATSUME: Emotional tone detection - Analyzes text and adapts UI
  useEffect(() => {
    const activeItem = getActiveItem();
    if (!activeItem || !activeItem?.content) return;
    
    // Debounce analysis - don't run on every keystroke
    const timeout = setTimeout(() => {
      const tone = analyzeEmotionalTone(activeItem.content);
      if (tone !== emotionalTone) {
        setEmotionalTone(tone);
      }
    }, 2000); // Analyze 2s after user stops typing
    
    return () => clearTimeout(timeout);
  }, [project.items]); // Re-run when content changes
  
  // NATSUME: Stuck detection - Shows inspiration when no activity
  useEffect(() => {
    const checkStuck = setInterval(() => {
      const timeSinceEdit = Date.now() - lastEditTime;
      
      // If no edits for 3 minutes and document is focused
      if (timeSinceEdit > 180000 && document.hasFocus() && !showInspiration) {
        const inspiration = generateInspiration('stuck', project.genre);
        setInspirationData(inspiration);
        setShowInspiration(true);
      }
    }, 30000); // Check every 30s
    
    return () => clearInterval(checkStuck);
  }, [lastEditTime, showInspiration, project.genre]);
  
  // NORMAN: Auto-dismiss feedback after 3 seconds
  useEffect(() => {
    if (showAIFeedback) {
      const timeout = setTimeout(() => {
        setShowAIFeedback(null);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [showAIFeedback]);
  
  // KRUG: Track edit time for stuck detection
  useEffect(() => {
    const activeItem = getActiveItem();
    if (activeItem && activeItem?.content) {
      setLastEditTime(Date.now());
    }
  }, [project.items]);
  
  // KRUG: Optimistic save with localStorage
  useEffect(() => {
    // Debounce saving
    const timeout = setTimeout(() => {
      try {
        setSaveStatus('saving');
        localStorage.setItem('kirjoitusstudio_project', JSON.stringify(project));
        setTimeout(() => setSaveStatus('saved'), 300); // Show saving briefly
      } catch (error) {
        console.error('Save error:', error);
        setSaveStatus('error');
      }
    }, 1000); // Save 1s after last change
    
    return () => clearTimeout(timeout);
  }, [project]);
  
  // NORMAN: Save learning preferences
  useEffect(() => {
    localStorage.setItem('aiLearningPreferences', JSON.stringify(userPreferences));
  }, [userPreferences]);

  // ========== NORMAN-KRUG-NATSUME: Demo & Helper Functions ==========
  
  // Demo: Show AI Feedback (can be triggered by keyboard shortcut)
  const showDemoAIFeedback = () => {
    setShowAIFeedback({
      action: 'Rytmi tasoitettu',
      details: '12% pehmeämpi siirtymä',
      type: 'rhythm'
    });
  };
  
  // Demo: Show inspiration panel
  const showDemoInspiration = () => {
    const inspiration = generateInspiration('demo', project.genre);
    setInspirationData(inspiration);
    setShowInspiration(true);
  };
  
  // Add keyboard shortcut for demo (Cmd+Shift+D)
  useEffect(() => {
    const handleDemoShortcut = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      
      // Cmd+Shift+D: Demo AI Feedback
      if (mod && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        showDemoAIFeedback();
      }
      
      // Cmd+Shift+I: Demo Inspiration
      if (mod && e.shiftKey && e.key === 'i') {
        e.preventDefault();
        showDemoInspiration();
      }
    };
    
    window.addEventListener('keydown', handleDemoShortcut);
    return () => window.removeEventListener('keydown', handleDemoShortcut);
  }, [project.genre]);

  // ========== VISUAL MASTERS: Effects ==========
  
  // SAGMEISTER: Track writing speed for living typography
  useEffect(() => {
    const now = Date.now();
    const timeSinceLastKey = now - lastKeystroke;
    
    // Calculate characters per second
    if (timeSinceLastKey < 2000) { // Within 2 seconds
      const cps = 1000 / timeSinceLastKey;
      // Normalize to 0-100 scale
      const normalizedSpeed = Math.min(100, cps * 20);
      setWritingSpeed(normalizedSpeed);
    } else {
      // Slow down if no typing
      setWritingSpeed(prev => Math.max(0, prev - 5));
    }
  }, [lastKeystroke]);
  
  // SAGMEISTER: Analyze emotional arc from content
  useEffect(() => {
    const activeItem = getActiveItem();
    if (!activeItem || !activeItem?.content) return;
    
    const timeout = setTimeout(() => {
      const arc = analyzeEmotionalArc(activeItem.content);
      if (arc !== emotionalArc) {
        setEmotionalArc(arc);
      }
    }, 2000); // Analyze 2s after typing stops
    
    return () => clearTimeout(timeout);
  }, [project.items]);
  
  // SUPERSIDE: Detect work phase from activity
  useEffect(() => {
    const timeout = setTimeout(() => {
      const phase = detectWorkPhase(activityMetrics);
      if (phase !== workPhase) {
        setWorkPhase(phase);
      }
    }, 3000); // Check every 3s
    
    return () => clearInterval(timeout);
  }, [activityMetrics]);
  
  // IDEO: Calculate cognitive load
  useEffect(() => {
    const activeItem = getActiveItem();
    if (!activeItem) return;
    
    const interval = setInterval(() => {
      const load = calculateCognitiveLoad({
        typingSpeed: writingSpeed,
        errorRate: 0, // Could track backspace frequency
        timeOnTask: (Date.now() - sessionStats.startTime) / 1000,
        pauseFrequency: writingSpeed < 20 ? 50 : 10
      });
      
      setCognitiveLoad(load);
    }, 5000); // Update every 5s
    
    return () => clearInterval(interval);
  }, [writingSpeed, sessionStats.startTime]);
  
  // Track keystroke for writing speed calculation
  useEffect(() => {
    const handleKeyPress = () => {
      setLastKeystroke(Date.now());
      setKeystrokeCount(prev => prev + 1);
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);
  // Vaihe 6: LocationKeeper-funktiot
  const detectLocationsInText = async () => {
    const activeItem = getActiveItem();
    if (!activeItem || !activeItem?.content) {
      alert('Ei sisältöä analysoitavaksi!');
      return;
    }

    setIsGenerating(true);

    const prompt = `Tunnista KAIKKI paikat tästä tekstistä. Sisällytä kaupungit, rakennukset, kadut, luontokohteet, maamerkit.
TEKSTI:
${activeItem?.content}

Palauta VAIN JSON (ei mitään muuta tekstiä):
{
  "locations": [
    {
      "name": "paikan nimi",
      "type": "city/building/landmark/public_square/street/nature/interior",
      "city": "kaupunki jos mainittu",
      "country": "maa jos mainittu",
      "context": "lause jossa paikka mainitaan"
    }
  ]
}
Jos ei paikkoja, palauta: {"locations": []}
VASTAA PELKKÄ JSON.`;

    try {
      const result = await window.electronAPI.claudeAPI(prompt);
      if (result.success) {
        // Parseri JSON
        let responseText = result.data.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const locationData = JSON.parse(responseText);

        // Lisää paikat projektiin (vältä duplikaatit)
        const existingNames = (project.locations || []).map(l => l.name.toLowerCase());
        const newLocations = locationData.locations
          .filter(loc => !existingNames.includes(loc.name.toLowerCase()))
          .map(loc => ({
            ...LOCATION_TEMPLATE,
            id: Date.now() + Math.random(),
            name: loc.name,
            type: loc.type || 'landmark',
            city: loc.city || '',
            country: loc.country || '',
            used_in_scenes: [activeItemId]
          }));

        if (newLocations.length > 0) {
          setProject({
            ...project,
            locations: [...(project.locations || []), ...newLocations]
          });
          alert(`Löydetty ${newLocations.length} uutta paikkaa!`);
        } else {
          alert('Ei uusia paikkoja löytynyt (tai kaikki jo lisätty).');
        }
      }
    } catch (err) {
      alert('Paikkojen tunnistus epäonnistui: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const fetchLocationData = async (location) => {
    setIsGenerating(true);

    try {
      // Web search - faktat
      const factsQuery = `${location.name} ${location.city} history architecture culture atmosphere`;
      const factsResult = await window.electronAPI.webSearch(factsQuery);

      // Web search - kuvat
      const imageQuery = `${location.name} ${location.city} photos`;
      const imageResult = await window.electronAPI.webSearch(imageQuery);

      // Pyydä Claude analysoimaan
      const prompt = `Analysoi tämä paikka kirjailijaa varten:

PAIKKA: ${location.name} (${location.city}, ${location.country})

FAKTATIEDOT:
${JSON.stringify(factsResult)}

KUVATIEDOT:
${JSON.stringify(imageResult)}

Palauta JSON:
{
  "facts": {
    "history": "lyhyt historia",
    "architecture": ["arkkitehtuuri", "piirteitä"],
    "features": ["keskeisiä", "ominaisuuksia"],
    "atmosphere": ["tunnelma", "sanoja"]
  },
  "visual": {
    "colors_day": ["päivävärit"],
    "colors_night": ["yövärit"],
    "lighting": ["valaistus"],
    "textures": ["tekstuurit"]
  },
  "writing_tips": ["vinkkejä", "kuvaukseen"]
}

VASTAA SUOMEKSI, JSON-MUODOSSA.`;

      const result = await window.electronAPI.claudeAPI(prompt);

      if (result.success) {
        let responseText = result.data.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const analysis = JSON.parse(responseText);

        // Päivitä location
        setProject({
          ...project,
          locations: project.locations.map(loc =>
            loc.id === location.id ? {
              ...loc,
              facts: analysis.facts,
              visual: analysis.visual,
              research: {
                last_searched: new Date().toISOString(),
                facts_source: 'web_search',
                images_source: 'web_search'
              }
            } : loc
          )
        });

        // Näytä AI-avustajassa
        if (!aiAssistantOpen) setAiAssistantOpen(true);
        setAiResponse(`📍 ${location.name} - Tiedot haettu!\n\n` +
          `📚 FAKTAT:\n${JSON.stringify(analysis.facts, null, 2)}\n\n` +
          `🎨 VISUAALISET ELEMENTIT:\n${JSON.stringify(analysis.visual, null, 2)}\n\n` +
          `💡 KIRJOITUSVINKIT:\n${analysis.writing_tips.join('\n')}`
        );

        alert('Tiedot haettu! Katso AI-avustaja.');
      }
    } catch (err) {
      alert('Tietojen haku epäonnistui: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateLocationDescription = async (location) => {
    if (!location.facts || !location.facts.history) {
      if (confirm('Paikan tiedot puuttuvat. Haetaanko ensin?')) {
        await fetchLocationData(location);
        return;
      }
    }

    setIsGenerating(true);

    const activeItem = getActiveItem();
    const context = activeItem?.content?.substring(0, 500) || '';

    const prompt = `Olet LocationKeeper - paikkojen kuvausasiantuntija.

PAIKKA:
${location.name} (${location.city}, ${location.country})

FAKTAT:
${JSON.stringify(location.facts, null, 2)}
VISUAALISET ELEMENTIT:
${JSON.stringify(location.visual, null, 2)}
KIRJAN GENRE:
{{GENRE}}
KOHTAUKSEN KONTEKSTI:
${context}
TEHTÄVÄ:
Kirjoita 2-4 kappaletta paikka-kuvausta joka:
1. **Faktatarkka**: Käytä todellisia yksityiskohtia paikasta
2. **Aistillinen**: Aktivoi näkö, kuulo, haju, tunto (ja maku jos relevantti)
3. **Genrespesifi**: Sovita tunnelma genreen ({{GENRE}})
4. **Tyylillinen**: Käytä defamiliarisaatiota, rytmiä, konkretiaa
5. **Emotionaalinen**: Luo tunnelma joka tukee kohtausta
GENRE-OHJEET:
{{GENRE_GUIDANCE}}
ÄLÄ:
- Listaa faktoja ("Paikalla on X ja Y")
- Kerro tunnelmaa suoraan ("Paikka oli ahdistava")
- Käytä kliseitä
- Ylihypettele
KIRJOITA NIIN ETTÄ SE SOPII SUORAAN ROMAANIIN.
VASTAA SUOMEKSI.`;

    try {
      const result = await callAI(selectedAIApi, prompt);

      if (result.success) {
        // Tallenna genre-spesifi kuvaus
        const updatedLocation = {
          ...location,
          genre_descriptions: {
            ...location.genre_descriptions,
            [project.genre]: result.data
          }
        };

        setProject({
          ...project,
          locations: project.locations.map(loc =>
            loc.id === location.id ? updatedLocation : loc
          )
        });

        // Näytä AI-avustajassa
        if (!aiAssistantOpen) setAiAssistantOpen(true);
        setAiResponse(result.data);
      }
    } catch (err) {
      alert('Kuvauksen generointi epäonnistui: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // ========== PHASE 3: AI CONCEPT MAP ==========

  // Build concept map data - themes, motifs, connections
  const buildConceptMap = () => {
    const concepts = new Map();
    const connections = [];

    // Collect all tags as concepts
    const allTags = getAllTags();
    allTags.forEach(tag => {
      const docs = getDocumentsWithTag(tag);
      concepts.set(`tag:${tag}`, {
        id: `tag:${tag}`,
        name: `#${tag}`,
        type: 'theme',
        weight: docs.length,
        color: 'var(--faust-gold)',
        documents: docs
      });
    });

    // Collect characters as concepts
    (project.characters || []).forEach(char => {
      const docs = getDocumentsMentioningEntity(char.name);
      concepts.set(`char:${char.id}`, {
        id: `char:${char.id}`,
        name: char.name,
        type: 'character',
        weight: docs.length,
        color: 'rgba(100, 200, 255, 0.8)',
        data: char,
        documents: docs
      });
    });

    // Collect locations as concepts
    (project.locations || []).forEach(loc => {
      const docs = getDocumentsMentioningEntity(loc.name);
      concepts.set(`loc:${loc.id}`, {
        id: `loc:${loc.id}`,
        name: loc.name,
        type: 'location',
        weight: docs.length,
        color: 'rgba(255, 200, 100, 0.8)',
        data: loc,
        documents: docs
      });
    });

    // Find connections based on co-occurrence in same documents
    const conceptArray = Array.from(concepts.values());
    conceptArray.forEach((concept1, i) => {
      conceptArray.slice(i + 1).forEach(concept2 => {
        // Count documents where both appear
        const sharedDocs = concept1.documents.filter(doc1 =>
          concept2.documents.some(doc2 => doc2.id === doc1.id)
        );

        if (sharedDocs.length > 0) {
          connections.push({
            source: concept1.id,
            target: concept2.id,
            weight: sharedDocs.length,
            documents: sharedDocs
          });
        }
      });
    });

    return {
      concepts: conceptArray,
      connections: connections.sort((a, b) => b.weight - a.weight).slice(0, 50) // Top 50 connections
    };
  };

  // ========== PHASE 2: NATURAL LANGUAGE QUERIES ==========

  // Parse natural language query into search parameters
  const parseNaturalQuery = (query) => {
    const lowerQuery = query.toLowerCase();
    const params = {
      characters: [],
      locations: [],
      tags: [],
      keywords: []
    };

    // Extract character references (with @character or "character")
    project.characters?.forEach(char => {
      const namePattern = new RegExp(`(@|")${char.name.toLowerCase()}("|\\s|$)`, 'i');
      if (lowerQuery.match(namePattern) || lowerQuery.includes(char.name.toLowerCase())) {
        params.characters.push(char.id);
      }
    });

    // Extract location references
    project.locations?.forEach(loc => {
      const namePattern = new RegExp(`(@|")${loc.name.toLowerCase()}("|\\s|$)`, 'i');
      if (lowerQuery.match(namePattern) || lowerQuery.includes(loc.name.toLowerCase())) {
        params.locations.push(loc.id);
      }
    });

    // Extract tags
    const tagMatches = lowerQuery.match(/#[\wäöå-]+/g);
    if (tagMatches) {
      params.tags = tagMatches.map(tag => tag.substring(1));
    }

    // Extract keywords (words not part of common query terms)
    const stopWords = ['show', 'find', 'search', 'where', 'with', 'in', 'at', 'the', 'all', 'scenes', 'chapters', 'näytä', 'etsi', 'hae', 'missä', 'kanssa', 'kaikki', 'kohtaukset', 'luvut'];
    const words = lowerQuery.split(/\s+/)
      .filter(word => !stopWords.includes(word) && word.length > 2 && !word.startsWith('#') && !word.startsWith('@'));
    params.keywords = words;

    return params;
  };
  // Search documents based on natural language query
  const executeNaturalSearch = (query) => {
    const params = parseNaturalQuery(query);
    const results = [];

    const searchItems = (items) => {
      items.forEach(item => {
        if (item.content) {
          let relevanceScore = 0;
          const matchReasons = [];

          // Check for character matches
          const { mentions } = parseMetadata(item.content);
          params.characters.forEach(charId => {
            if (mentions.some(m => m.entity && m.entity.id === charId)) {
              relevanceScore += 10;
              matchReasons.push(`Sisältää hahmon: ${mentions.find(m => m.entity && m.entity.id === charId).name}`);
            }
          });

          // Check for location matches
          params.locations.forEach(locId => {
            if (mentions.some(m => m.entity && m.entity.id === locId)) {
              relevanceScore += 10;
              matchReasons.push(`Sisältää paikan: ${mentions.find(m => m.entity && m.entity.id === locId).name}`);
            }
          });

          // Check for tag matches
          const { tags } = parseMetadata(item.content);
          params.tags.forEach(tag => {
            if (tags.some(t => t.tag.toLowerCase() === tag.toLowerCase())) {
              relevanceScore += 5;
              matchReasons.push(`Tagi: #${tag}`);
            }
          });

          // Check for keyword matches
          params.keywords.forEach(keyword => {
            const regex = new RegExp(keyword, 'gi');
            const matches = item.content.match(regex);
            if (matches) {
              relevanceScore += matches.length;
              matchReasons.push(`Avainsana: "${keyword}" (${matches.length}x)`);
            }
          });

          if (relevanceScore > 0) {
            results.push({
              item,
              score: relevanceScore,
              reasons: matchReasons,
              preview: item.content.substring(0, 200) + '...'
            });
          }
        }

        if (item.children) {
          searchItems(item.children);
        }
      });
    };

    searchItems(project.items);

    // Sort by relevance
    results.sort((a, b) => b.score - a.score);

    return results;
  };

  // ========== PHASE 2: TIMELINE / KANBAN VIEW ==========
  // Build timeline data from project chapters
  const buildTimelineData = () => {
    const chapters = [];
    
    const collectChapters = (items, level = 0) => {
      items.forEach((item, index) => {
        if (item.type === 'chapter') {
          const { tags, mentions } = parseMetadata(item.content || '');
          const links = parseLinks(item.content || '');
          
          chapters.push({
            id: item.id,
            title: item.title || `Luku ${index + 1}`,
            content: item.content || '',
            wordCount: item.wordCount || 0,
            level,
            order: index,
            tags,
            characters: mentions
              .filter(m => m.entity && m.entity.type === 'character')
              .map(m => m.entity.data),
            locations: mentions
              .filter(m => m.entity && m.entity.type === 'location')
              .map(m => m.entity.data),
            links,
            status: item.status || 'draft', // 'draft', 'review', 'done'
            notes: item.notes || '',
            createdAt: item.createdAt || Date.now(),
            updatedAt: item.updatedAt || Date.now()
          });
        }
        
        if (item.children && item.children.length > 0) {
          collectChapters(item.children, level + 1);
        }
      });
    };
    
    collectChapters(project.items);
    return chapters;
  };

  // Update chapter status
  const updateChapterStatus = (chapterId, newStatus) => {
    const updateItemsRecursively = (items) => {
      return items.map(item => {
        if (item.id === chapterId) {
          return { ...item, status: newStatus, updatedAt: Date.now() };
        }
        if (item.children) {
          return { ...item, children: updateItemsRecursively(item.children) };
        }
        return item;
      });
    };
    
    setProject({
      ...project,
      items: updateItemsRecursively(project.items)
    });
  };

  // ========== GRAPH VIEW: Entity relationships ==========
  // Build graph data from project
  const buildGraphData = () => {
    const nodes = [];
    const links = [];
    const nodeMap = new Map();

    // Add character nodes
    (project.characters || []).forEach(char => {
      const node = {
        id: `char-${char.id}`,
        name: char.name,
        type: 'character',
        data: char
      };
      nodes.push(node);
      nodeMap.set(char.name.toLowerCase(), node);
    });

    // Add location nodes
    (project.locations || []).forEach(loc => {
      const node = {
        id: `loc-${loc.id}`,
        name: loc.name,
        type: 'location',
        data: loc
      };
      nodes.push(node);
      nodeMap.set(loc.name.toLowerCase(), node);
    });

    // Find links by analyzing all documents
    const analyzeItems = (items) => {
      items.forEach(item => {
        if (item.content) {
          // Find [[entity]] links
          const itemLinks = parseLinks(item.content);
          itemLinks.forEach(link => {
            const sourceNode = nodeMap.get(link.entityName.toLowerCase());
            if (sourceNode) {
              // Check if there are co-occurrences in the same document
              itemLinks.forEach(otherLink => {
                if (link !== otherLink) {
                  const targetNode = nodeMap.get(otherLink.entityName.toLowerCase());
                  if (targetNode && sourceNode.id !== targetNode.id) {
                    // Check if link already exists
                    const existingLink = links.find(l => 
                      (l.source === sourceNode.id && l.target === targetNode.id) ||
                      (l.source === targetNode.id && l.target === sourceNode.id)
                    );
                    if (!existingLink) {
                      links.push({
                        source: sourceNode.id,
                        target: targetNode.id,
                        document: item.title || 'Nimetön'
                      });
                    }
                  }
                }
              });
            }
          });
        }
        if (item.children) {
          analyzeItems(item.children);
        }
      });
    };

    analyzeItems(project.items);

    return { nodes, links };
  };

  // ========== INLINE METADATA: #tags and @entities ==========

  // Parse text for #tags and @entities
  const parseMetadata = (text) => {
    if (!text) return { tags: [], mentions: [] };
    
    const tags = [];
    const mentions = [];
    
    // Find #tags
    const tagRegex = /#([a-zA-ZäöåÄÖÅ0-9_-]+)/g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(text)) !== null) {
      tags.push({
        text: tagMatch[0],
        tag: tagMatch[1],
        startIndex: tagMatch.index,
        endIndex: tagMatch.index + tagMatch[0].length
      });
    }
    
    // Find @entities
    const mentionRegex = /@([a-zA-ZäöåÄÖÅ0-9_-]+)/g;
    let mentionMatch;
    while ((mentionMatch = mentionRegex.exec(text)) !== null) {
      const entityName = mentionMatch[1];
      const entity = findEntity(entityName);
      
      mentions.push({
        text: mentionMatch[0],
        name: entityName,
        entity,
        startIndex: mentionMatch.index,
        endIndex: mentionMatch.index + mentionMatch[0].length
      });
    }
    
    return { tags, mentions };
  };

  // Collect all tags from all documents
  const getAllTags = () => {
    const allTags = new Set();
    
    const collectTags = (items) => {
      items.forEach(item => {
        if (item.content) {
          const { tags } = parseMetadata(item.content);
          tags.forEach(t => allTags.add(t.tag));
        }
        if (item.children) {
          collectTags(item.children);
        }
      });
    };
    
    collectTags(project.items);
    return Array.from(allTags);
  };

  // Get all documents with a specific tag
  const getDocumentsWithTag = (tagName) => {
    const documents = [];
    
    const searchItems = (items) => {
      items.forEach(item => {
        if (item.content) {
          const { tags } = parseMetadata(item.content);
          if (tags.some(t => t.tag.toLowerCase() === tagName.toLowerCase())) {
            documents.push(item);
          }
        }
        if (item.children) {
          searchItems(item.children);
        }
      });
    };
    
    searchItems(project.items);
    return documents;
  };
  // Get all documents mentioning an entity
  const getDocumentsMentioningEntity = (entityName) => {
    const documents = [];
    
    const searchItems = (items) => {
      items.forEach(item => {
        if (item.content) {
          const { mentions } = parseMetadata(item.content);
          if (mentions.some(m => m.name.toLowerCase() === entityName.toLowerCase())) {
            documents.push(item);
          }
        }
        if (item.children) {
          searchItems(item.children);
        }
      });
    };
    
    searchItems(project.items);
    return documents;
  };

  // ========== TEMPLATE SYSTEM: /command syntax ==========

  const TEMPLATES = {
    luku: {
      name: 'Uusi luku',
      description: 'Luo uusi luku',
      template: `# [Luvun otsikko]
## Kohtaus 1
[Kirjoita tähän...]

---

**Muistiinpanot:**
- 
- 

**Tarkista:**
- [ ] Hahmot johdonmukaisia
- [ ] Juoni etenee loogisesti
- [ ] Tunnelma on oikea`
    },
    kohtaus: {
      name: 'Uusi kohtaus',
      description: 'Lisää kohtauspohja',
      template: `## Kohtaus: [Otsikko]
**Paikka:** [Missä tämä tapahtuu?]
**Aika:** [Milloin?]
**Läsnä:** [Ketkä hahmot paikalla?]
**Tavoite:** [Mitä kohtauksen tulisi saavuttaa?]

---

[Aloita kirjoittaminen...]`
    },
    hahmo: {
      name: 'Luo hahmo',
      description: 'Lisää uusi hahmo projektiisi',
      action: (project, setProject) => {
        const newChar = {
          id: Date.now(),
          name: 'Uusi hahmo',
          bio: { age: '', occupation: '', appearance: '' },
          psychology: { want: '', fear: '', weakness: '', values: [] },
          voice: { description: '', lexicon: [], avgSentenceLength: 12 },
          resources: [],
          injuries: []
        };
        setProject({
          ...project,
          characters: [...(project.characters || []), newChar]
        });
        return '[[Uusi hahmo]] luotu ✓';
      }
    },
    paikka: {
      name: 'Luo paikka',
      description: 'Lisää uusi paikka projektiisi',
      action: (project, setProject) => {
        const newLocation = {
          id: Date.now(),
          name: 'Uusi paikka',
          type: 'interior',
          facts: {},
          visual: {},
          genre_descriptions: {}
        };
        setProject({
          ...project,
          locations: [...(project.locations || []), newLocation]
        });
        return '[[Uusi paikka]] luotu ✓';
      }
    },
    dialogi: {
      name: 'Dialogipohja',
      description: 'Lisää dialogimalline',
      template: `[HAHMO 1]: "[Mitä he sanovat?]"

[Toiminta/reaktio]

[HAHMO 2]: "[Vastaus]"

[Toiminta/reaktio]`
    },
    kuvaus: {
      name: 'Kuvauspohja',
      description: 'Aistillinen kuvaus',
      template: `[Näkö:] 
[Kuulo:] 
[Haju:] 
[Tunto:] 
[Tunnelma:]`
    }
  };

  // Execute template command
  const executeTemplate = (commandName) => {
    const template = TEMPLATES[commandName];
    if (!template) return;

    if (template.action) {
      // Execute action (create entity)
      const result = template.action(project, setProject);
      
      // Insert result text into editor
      const activeItem = getActiveItem();
      if (activeItem && editorRef.current) {
        const currentContent = activeItem?.content || '';
        const cursorPos = editorRef.current.selectionStart;
        const beforeCursor = currentContent.substring(0, cursorPos);
        const afterCursor = currentContent.substring(cursorPos);
        
        // Remove the /command text
        const lastSlashIndex = beforeCursor.lastIndexOf('/');
        const newBefore = beforeCursor.substring(0, lastSlashIndex);
        
        const newContent = newBefore + result + '\n' + afterCursor;
        updateItem(activeItemId, { content: newContent });
        
        // Move cursor after inserted text
        setTimeout(() => {
          if (editorRef.current) {
            const newPos = newBefore.length + result.length + 1;
            editorRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
      }
    } else if (template.template) {
      // Insert template text
      const activeItem = getActiveItem();
      if (activeItem && editorRef.current) {
        const currentContent = activeItem?.content || '';
        const cursorPos = editorRef.current.selectionStart;
        const beforeCursor = currentContent.substring(0, cursorPos);
        const afterCursor = currentContent.substring(cursorPos);
        
        // Remove the /command text
        const lastSlashIndex = beforeCursor.lastIndexOf('/');
        const newBefore = beforeCursor.substring(0, lastSlashIndex);
        
        const newContent = newBefore + template.template + afterCursor;
        updateItem(activeItemId, { content: newContent });
        
        // Move cursor after inserted template
        setTimeout(() => {
          if (editorRef.current) {
            const newPos = newBefore.length + template.template.length;
            editorRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
      }
    }

    setShowTemplateMenu(false);
    setTemplateQuery('');
  };

  // ========== BI-DIRECTIONAL LINKS: [[entity]] syntax ==========

  // Parse text for [[entity]] links
  const parseLinks = (text) => {
    if (!text) return [];
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(text)) !== null) {
      const entityName = match[1];
      const entity = findEntity(entityName);
      
      if (entity) {
        links.push({
          text: match[0],
          entityName,
          entity,
          startIndex: match.index,
          endIndex: match.index + match[0].length
        });
      }
    }
    
    return links;
  };

  // Find entity (character or location) by name
  const findEntity = (name) => {
    const lowerName = name.toLowerCase();
    
    // Search in characters
    const character = project.characters?.find(c => 
      c.name.toLowerCase() === lowerName
    );
    if (character) return { type: 'character', data: character };
    
    // Search in locations
    const location = project.locations?.find(l => 
      l.name.toLowerCase() === lowerName
    );
    if (location) return { type: 'location', data: location };
    
    return null;
  };

  // Get all backlinks for an entity
  const getBacklinks = (entityName) => {
    const backlinks = [];
    
    const searchItems = (items) => {
      items.forEach(item => {
        if (item?.content) {
          const links = parseLinks(item.content);
          const matchingLinks = links.filter(link => 
            link.entityName.toLowerCase() === entityName.toLowerCase()
          );
          
          if (matchingLinks.length > 0) {
            backlinks.push({
              item,
              count: matchingLinks.length
            });
          }
        }
        
        if (item.children) {
          searchItems(item.children);
        }
      });
    };
    
    searchItems(project.items);
    return backlinks;
  };

  // Create link suggestion for selected text
  const suggestLink = (selectedText) => {
    const entity = findEntity(selectedText);
    return entity;
  };

  // ========== AI DIFF-VIEW: Parse and apply/reject edits ==========

  // Parse AI response for suggested edits
  const parseAIResponse = (aiText) => {
    const edits = [];
    const lines = aiText.split('\n');
    let currentEdit = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Etsi muokkausehdotuksia eri muodoissa
      if (line.includes('EHDOTUS:') || line.includes('MUUTOS:') || line.includes('KORJAUS:')) {
        if (currentEdit) edits.push(currentEdit);
        currentEdit = {
          id: Date.now() + i,
          type: 'suggestion',
          original: '',
          suggested: '',
          explanation: line.replace(/EHDOTUS:|MUUTOS:|KORJAUS:/g, '').trim()
        };
      } else if (line.includes('ALKUPERÄINEN:') || line.includes('BEFORE:')) {
        if (currentEdit) {
          const nextLines = [];
          for (let j = i + 1; j < lines.length && !lines[j].includes('EHDOTETTU:') && !lines[j].includes('AFTER:'); j++) {
            nextLines.push(lines[j]);
          }
          currentEdit.original = nextLines.join('\n').trim();
        }
      } else if (line.includes('EHDOTETTU:') || line.includes('AFTER:')) {
        if (currentEdit) {
          const nextLines = [];
          for (let j = i + 1; j < lines.length && !lines[j].includes('EHDOTUS:') && !lines[j].includes('---'); j++) {
            nextLines.push(lines[j]);
          }
          currentEdit.suggested = nextLines.join('\n').trim();
        }
      }
    }

    if (currentEdit && currentEdit.original && currentEdit.suggested) {
      edits.push(currentEdit);
    }

    return edits;
  };

  // Apply an edit
  const applyEdit = (editId) => {
    const edit = pendingEdits.find(e => e.id === editId);
    if (!edit) return;

    const activeItem = getActiveItem();
    if (!activeItem) return;

    // Replace the text
    const newContent = activeItem?.content?.replace(edit.original, edit.suggested);
    updateItem(activeItemId, { content: newContent });

    // Record in Grimoire
    const acceptance = {
      timestamp: Date.now(),
      type: 'edit_accepted',
      original: edit.original,
      suggested: edit.suggested,
      explanation: edit.explanation
    };
    
    setProject({
      ...project,
      grimoire: {
        ...project.grimoire,
        acceptedChanges: [...(project.grimoire?.acceptedChanges || []), acceptance]
      }
    });

    // Remove from pending
    setPendingEdits(pendingEdits.filter(e => e.id !== editId));
  };
  // Reject an edit
  const rejectEdit = (editId) => {
    const edit = pendingEdits.find(e => e.id === editId);
    if (!edit) return;

    // Record in Grimoire
    const rejection = {
      timestamp: Date.now(),
      type: 'edit_rejected',
      original: edit.original,
      suggested: edit.suggested,
      explanation: edit.explanation,
      reason: 'User rejected'
    };

    setProject({
      ...project,
      grimoire: {
        ...project.grimoire,
        rejectedSuggestions: [...(project.grimoire?.rejectedSuggestions || []), rejection]
      }
    });

    // Remove from pending
    setPendingEdits(pendingEdits.filter(e => e.id !== editId));
  };

  // ========== AI AGENTS: CharacterKeeper & StoryKeeper ==========

  // CharacterKeeper - Hahmojen jatkuvuuden automaattinen valvonta
  const runCharacterKeeper = async (content, character) => {
    if (!character || !content) return null;

    const prompt = `Olet CharacterKeeper - hahmojen jatkuvuuden valvoja.

HAHMO: ${character.name}

PSYKOLOGINEN PROFIILI:
- Tavoite: ${character.psychology?.want || 'Ei määritelty'}
- Pelko: ${character.psychology?.fear || 'Ei määritelty'}
- Heikkous: ${character.psychology?.weakness || 'Ei määritelty'}
- Arvot: ${character.psychology?.values?.join(', ') || 'Ei määritelty'}

FYYSISET FAKTAT:
- Resurssit/Taidot: ${character.resources?.join(', ') || 'Ei määritelty'}
- Loukkaantumiset: ${character.injuries?.join(', ') || 'Ei loukkaantumisia'}
- Ulkonäkö: ${character.bio?.appearance || 'Ei kuvausta'}
HAHMON ÄÄNI:
- Tyyli: ${character.voice?.description || 'Ei määritelty'}
- Tyypilliset sanat: ${character.voice?.lexicon?.join(', ') || 'Ei määritelty'}

KIRJOITETTU TEKSTI:
${content}

TEHTÄVÄ:
Tarkista onko hahmon esitys johdonmukainen. Etsi:

1. **Psykologiset ristiriidat**: Toimiiko hahmo arvojensa/tavoitteidensa vastaisesti ilman selitystä?
2. **Resurssiongelmat**: Käyttääkö hahmo esineitä/taitoja joita hänellä ei ole?
3. **Loukkaantumiset unohdettu**: Mainitaanko aiemmat vammat?
4. **Äänen muutos**: Puhuuko hahmo tyylillä joka ei sovi hänen profiilinsa?
5. **Ulkonäön muutokset**: Muuttuuko ulkonäkö selittämättä?

VASTAA JSON-muodossa:
{
  "issues": [
    {
      "type": "psychology|resources|injury|voice|appearance",
      "severity": "low|medium|high",
      "location": "Lainaus tekstistä",
      "problem": "Mikä on ongelma",
      "suggestion": "Miten korjata"
    }
  ],
  "summary": "Lyhyt yhteenveto"
}

Jos ei ongelmia, palauta tyhjä issues-taulukko.`;

    try {
      const result = await callAI(selectedAIApi, prompt);
      if (result.success) {
        try {
          const analysis = JSON.parse(result.data);
          return analysis;
        } catch (e) {
          // Jos AI ei palauttanut JSON, yritä poimia tiedot
          return { issues: [], summary: result.data };
        }
      }
    } catch (err) {
      console.error('CharacterKeeper error:', err);
      return null;
    }
  };

  // StoryKeeper - Juonen loogisen eheyden valvonta

  // 1. TARKISTA JUONEN LOGIIKKA
  const checkStoryLogic = async () => {
    if (!project.story || !project.story.outline || project.story.outline.length === 0) {
      alert('Luo ensin tarinan rakenne!');
      return;
    }

    setIsGenerating(true);

    const prompt = `Olet StoryKeeper - juonen loogisen eheyden valvoja.

Tarkista tämän tarinan logiikka:

LUVUT:
{{OUTLINE}}

JUONILANGAT:
{{THREADS}}

TARKISTA:
1. Onko luvuissa loogisia ristiriitoja?
2. Ovatko kaikki juonilangat suljettu?
3. Onko kausaalisuus kunnossa? (A vaikuttaa B:hen)
4. Onko tempo järkevä?

VASTAA:
## ✅ LOOGISESTI EHEÄT
[Luvut joissa ei ongelmia]

## ⚠️ HUOMIOITAVAA
[Pienet epäjohdonmukaisuudet + ehdotukset]

## ❌ KRIITTISET RISTIRIIDAT
[Isot ongelmat + korjaukset]

## 🧵 AVOIMET JUONILANGAT
[Juonilangat jotka pitää sulkea]

## 📊 YHTEENVETO
[Kokonaisarvio]

VASTAA SUOMEKSI.`;

    try {
      const result = await callAI(selectedAIApi, prompt);
      if (result.success) {
        if (!aiAssistantOpen) setAiAssistantOpen(true);
        setAiResponse(result.data);
      }
    } catch (err) {
      alert('Juonitarkistus epäonnistui: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. TUNNISTA TAPAHTUMAT LUVUSTA (NYT LISÄTTY!)
  const detectEventsInChapter = async (chapterNumber, text) => {
    const prompt = `Tunnista KESKEISET TAPAHTUMAT tästä luvusta.

LUKU ${chapterNumber}:
${text}

Palauta JSON:
{
  "events": [
    {
      "description": "Lyhyt kuvaus (1 lause)",
      "significance": "major/minor",
      "immutable": true/false,
      "characters_involved": ["hahmon nimi"],
      "location": "paikka"
    }
  ]
}
VAIN MERKITTÄVÄT TAPAHTUMAT (ei jokaista pientä toimintoa).

VASTAA PELKKÄ JSON.`;

    try {
      const result = await callAI(selectedAIApi, prompt);
      if (result.success) {
        let responseText = result.data.replace(/\`\`\`json\n?/g, '').replace(/\`\`\`\n?/g, '').trim();
        const eventData = JSON.parse(responseText);
        
        // Lisää tapahtumat projektiin
        const newEvents = eventData.events.map(e => ({
          ...EVENT_TEMPLATE,
          id: Date.now() + Math.random(),
          chapter: chapterNumber,
          timestamp: `Luku ${chapterNumber}`,
          ...e
        }));

        setProject({
          ...project,
          story: {
            ...project.story,
            events: [...(project.story.events || []), ...newEvents]
          }
        });

        return newEvents;
      }
    } catch (err) {
      console.error('Tapahtumien tunnistus epäonnistui:', err);
      return [];
    }
  };

  // 3. TARKISTA NYKYISEN LUVUN MAHDOLLISUUS
  const checkChapterFeasibility = async (chapterNumber) => {
    const currentChapter = project.story.outline?.find(ch => ch.chapter === chapterNumber);
    if (!currentChapter) return;

    const previousEvents = (project.story.events || [])
      .filter(e => e.chapter < chapterNumber);

    const openThreads = (project.story.threads || [])
      .filter(t => t.status === 'open');

    const prompt = `Tarkista voiko Luku ${chapterNumber} tapahtua loogisesti.

AIKAISEMMAT TAPAHTUMAT:
${previousEvents.map(e => 
  `- Luku ${e.chapter}: ${e.description}`
).join('\n')}

SUUNNITELTU LUKU ${chapterNumber}:
Otsikko: ${currentChapter.title}
Yhteenveto: ${currentChapter.summary}

AVOIMET JUONILANGAT:
${openThreads.map(t => 
  `- ${t.name} (Avattu: Luku ${t.opened_chapter})`
).join('\n')}

TARKISTA:
1. Onko kaikki edeltävät tapahtumat olemassa?
2. Voiko tämä loogisesti tapahtua nyt?
3. Rikkooko tämä aikaisempia faktoja?
4. Pitäisikö joku juonilanka edetä/sulkea?

VASTAA:
✅ jos loogisesti mahdollinen
⚠️ jos pieniä huomioita
❌ jos ristiriita + ehdotukset

VASTAA SUOMEKSI.`;

    try {
      const result = await callAI(selectedAIApi, prompt);
      if (result.success) {
        if (!aiAssistantOpen) setAiAssistantOpen(true);
        setAiResponse(result.data);
      }
    } catch (err) {
      alert('Tarkistus epäonnistui: ' + err.message);
    }
  };

  // 4. EHDOTA SEURAAVAA LUKUA
  const suggestNextChapter = async () => {
    const lastChapter = Math.max(...(project.story.outline || []).map(ch => ch.chapter), 0);

    const prompt = `Ehdota mitä Luku ${lastChapter + 1}:ssa voisi tapahtua.

AIKAISEMMAT LUVUT:
${(project.story.outline || []).map(ch => 
  `Luku ${ch.chapter}: ${ch.title || 'Nimetön'}
  ${ch.summary || 'Ei yhteenvetoa'}`
).join('\n\n')}
AVOIMET JUONILANGAT:
${(project.story.threads || []).filter(t => t.status === 'open').map(t =>
  `- ${t.name} (${t.importance})`
).join('\n')}
GENRE: ${GENRE_OPTIONS.find(g => g.id === project.genre)?.name || 'Ei määritelty'}

EHDOTA:
3-5 mahdollista suuntaa Luku ${lastChapter + 1}:lle jotka:
1. Jatkavat loogisesti tarinaa
2. Vievät juonilankaa eteenpäin
3. Lisäävät jännitettä
4. Sopivat genreen

VASTAA SUOMEKSI, SELKEÄSTI NUMEROITUNA.`;

    try {
      const result = await callAI(selectedAIApi, prompt);
      if (result.success) {
        if (!aiAssistantOpen) setAiAssistantOpen(true);
        setAiResponse(result.data);
      }
    } catch (err) {
      alert('Ehdotusten generointi epäonnistui: ' + err.message);
    }
  };

  // APUFUNKTIO: Genre-ohjeet
  const getGenreGuidance = (genre) => {
    const guides = {
      psychological_thriller: 'Focus: Ahdistus, kontrollin menetys. Elementit: Äänet, varjot, katseet. Tone: Kylmä, uhkaava.',
      romantic_drama: 'Focus: Lämpö, intimiteetti, muistot. Elementit: Valo, värit, kosketukset. Tone: Pehmeä, nostalginen.',
      action_thriller: 'Focus: Nopeus, liike, vaara. Elementit: Pakoväylät, esteet. Tone: Jännittynyt, dynaaminen.',
      horror: 'Focus: Epätodellinen, vääristynyt. Elementit: Äänet, hajut, varjot. Tone: Ahdistava, sairaalloinen.',
      noir: 'Focus: Varjot, rikkinäisyys. Elementit: Sade, pimeys, kontrastit. Tone: Karu, kylmä.',
      historical_fiction: 'Focus: Aika, autenttisuus. Elementit: Historialliset kerrokset. Tone: Reflektoiva, ajallinen.'
    };

    return guides[genre] || guides.psychological_thriller;
  };

  const sessionWords = sessionStats.currentWordCount - sessionStats.startWordCount;
  const progressToTarget = (getTotalWordCount() / project.targets.project) * 100;

  // Vaihe 5: CharacterKeeper - checkCharacterContinuity-funktio
  const checkCharacterContinuity = (character) => {
    const activeItem = getActiveItem();
    if (!activeItem || !activeItem?.content) {
      alert('Ei sisältöä tarkistettavaksi!');
      return;
    }

    // Rakenna hahmon tiedot promptiin
    const characterInfo = `
NIMI: ${character.name}
IKÄ: ${character.bio.age || 'ei määritelty'}
AMMATTI: ${character.bio.occupation || 'ei määritelty'}
TAVOITE: ${character.psychology.want || 'ei määritelty'}
PELKO: ${character.psychology.fear || 'ei määritelty'}
HEIKKOUS: ${character.psychology.weakness || 'ei määritelty'}
PUHETYYLI: ${character.voice.description || 'ei määritelty'}
TYYPILLISET FRAASIT: ${(character.voice.lexicon || []).join(', ') || 'ei määritelty'}
RESURSSIT: ${(character.state.resources || []).join(', ') || 'ei'}
LOUKKAANTUMISET: ${(character.state.injuries || []).join(', ') || 'ei'}
`.trim();

    const prompt = `Olet CharacterKeeper - hahmojen jatkuvuuden valvoja.
Tarkista tämän hahmon jatkuvuus kohtauksessa:
${characterInfo}
KOHTAUKSEN TEKSTI:
${activeItem?.content}
TARKISTA:
1. **Ääni**: Puhuuko hahmo tyylilleen uskollisesti?
2. **Psykologia**: Ovatko teot/päätökset johdonmukaisia tavoitteiden/pelkojen kanssa?
3. **Faktat**: Käytetäänkö esineitä/taitoja joita hänellä ei ole?
4. **Loukkaantumiset**: Mainitaanko/huomioidaanko loukkaantumiset?
ANNA:
✅ Mikä toimii hyvin
⚠️ Pienet epäjohdonmukaisuudet + korjausehdotus
❌ Kriittiset ongelmat + konkreettinen korjaus
VASTAA SUOMEKSI.`;

    // Avaa AI-avustaja ja lähetä tarkistus
    if (!aiAssistantOpen) setAiAssistantOpen(true);
    setAiPrompt(`Tarkista: ${character.name}`);
    callAIAPI(prompt, false);
  };

  // Progress Bar -komponentti
  const ProgressBar = ({ value, max, label, color = 'blue' }) => {
    const percentage = Math.min((value / max) * 100, 100);
    return e('div', { className: 'mb-3' },
      e('div', { className: 'flex justify-between text-xs mb-1' },
        e('span', null, label),
        e('span', null, `${value} / ${max} (${Math.round(percentage)}%)`)
      ),
      e('div', { className: `w-full bg-gray-700 rounded-full h-2` },
        e('div', {
          className: `bg-${color}-500 h-2 rounded-full transition-all duration-300`,
          style: { width: `${percentage}%` }
        })
      )
    );
  };

  // Command Palette commands
  const commands = [
    { id: 'new-chapter', name: 'Uusi luku', category: 'Tiedosto', action: () => { /* TODO */ } },
    { id: 'new-folder', name: 'Uusi kansio', category: 'Tiedosto', action: () => { /* TODO */ } },
    { id: 'export-pdf', name: 'Vie PDF', category: 'Vie', action: () => exportDocument('pdf') },
    { id: 'export-docx', name: 'Vie DOCX', category: 'Vie', action: () => exportDocument('docx') },
    { id: 'toggle-sidebar', name: 'Näytä/Piilota sivupaneeli', category: 'Näkymä', action: () => setShowSidebar(!showSidebar) },
    { id: 'toggle-inspector', name: 'Näytä/Piilota Inspector', category: 'Näkymä', action: () => setShowInspector(!showInspector) },
    { id: 'focus-mode', name: 'Focus Mode', category: 'Näkymä', action: () => setViewMode(viewMode === 'focus' ? 'editor' : 'focus') },
    { id: 'typewriter-mode', name: 'Typewriter Mode', category: 'Näkymä', action: () => setTypewriterMode(!typewriterMode) },
    { id: 'toggle-theme', name: 'Vaihda NOX/DEIS', category: 'Ulkoasu', action: () => setIsDarkMode(!isDarkMode) },
    { id: 'timeline-view', name: '🜕 Aikajana / Kanban', category: 'Näkymä', action: () => setShowTimelineView(!showTimelineView) },
    { id: 'graph-view', name: '🜍 Verkkonäkymä', category: 'Näkymä', action: () => setShowGraphView(!showGraphView) },
    { id: 'concept-map', name: '🜖 Käsitekartta', category: 'Näkymä', action: () => setShowConceptMap(!showConceptMap) },
    { id: 'natural-search', name: '🔍 Luonnollinen haku', category: 'Haku', action: () => setShowSearchModal(!showSearchModal) },
    { id: 'ai-assistant', name: 'Avaa AI-avustaja', category: 'AI', action: () => setAiAssistantOpen(true) },
    { id: 'snapshot', name: 'Luo tilannekuva', category: 'Versiot', action: () => createSnapshot() },
    { id: 'characters', name: 'Hahmot', category: 'Inspector', action: () => { setInspectorTab('characters'); setShowInspector(true); } },
    { id: 'locations', name: 'Paikat', category: 'Inspector', action: () => { setInspectorTab('locations'); setShowInspector(true); } },
    { id: 'story', name: 'Tarina', category: 'Inspector', action: () => { setInspectorTab('story'); setShowInspector(true); } },
    { id: 'techniques', name: 'Kirjoitustekniikat', category: 'AI', action: () => { setInspectorTab('tekniikat'); setShowInspector(true); } }
  ];

  const filteredCommands = commands.filter(cmd =>
    cmd.name.toLowerCase().includes(commandQuery.toLowerCase()) ||
    cmd.category.toLowerCase().includes(commandQuery.toLowerCase())
  );

  console.log('🎭 About to return JSX...');
  console.log('📊 State:', { 
    isDarkMode, 
    showSidebar, 
    showInspector, 
    activeItemId,
    projectItemsCount: project?.items?.length 
  });
  
  const result = e(React.Fragment, null,
    // Inject FAUST styles
    e('style', { dangerouslySetInnerHTML: { __html: FAUST_STYLES } }),
    
    // Command Palette
    showCommandPalette && e('div', {
      className: 'fixed inset-0 z-50 flex items-start justify-center pt-32',
      style: {
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)'
      },
      onClick: () => setShowCommandPalette(false)
    },
      e('div', {
        className: 'bg-gray-900 rounded-lg shadow-2xl overflow-hidden',
        style: {
          width: '600px',
          maxHeight: '500px',
          border: '2px solid var(--faust-gold)',
          boxShadow: '0 0 30px rgba(154, 123, 79, 0.3)'
        },
        onClick: (e) => e.stopPropagation()
      },
        // Search input
        e('input', {
          type: 'text',
          placeholder: '🔍 Hae komentoa... (⌘K)',
          value: commandQuery,
          autoFocus: true,
          onChange: (e) => setCommandQuery(e.target.value),
          className: 'w-full p-4 text-lg',
          style: {
            background: 'var(--faust-dark)',
            color: 'var(--faust-text-primary)',
            border: 'none',
            borderBottom: '1px solid var(--faust-border)',
            outline: 'none',
            fontFamily: 'var(--font-body)'
          }
        }),
        
        // Commands list
        e('div', {
          className: 'overflow-y-auto',
          style: { maxHeight: '400px' }
        },
          filteredCommands.length === 0 ? 
            e('div', {
              className: 'p-8 text-center',
              style: { color: 'var(--faust-text-secondary)' }
            }, 'Ei tuloksia') :
            filteredCommands.map((cmd, idx) => 
              e('div', {
                key: cmd.id,
                className: 'px-4 py-3 cursor-pointer hover:bg-gray-800 flex justify-between items-center',
                style: {
                  borderBottom: idx < filteredCommands.length - 1 ? '1px solid var(--faust-border)' : 'none',
                  transition: 'background-color 150ms'
                },
                onClick: () => {
                  cmd.action();
                  setShowCommandPalette(false);
                  setCommandQuery('');
                }
              },
                e('div', null,
                  e('div', {
                    style: {
                      color: 'var(--faust-text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '15px',
                      marginBottom: '4px'
                    }
                  }, cmd.name),
                  e('div', {
                    style: {
                      color: 'var(--faust-text-tertiary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }
                  }, cmd.category)
                ),
                e('div', {
                  style: {
                    color: 'var(--faust-gold)',
                    fontSize: '20px'
                  }
                }, '→')
              )
            )
        )
      )
    ),
    
    // macOS Titlebar (uses native traffic lights)
    e('header', {
      className: 'fixed top-0 left-0 right-0 h-[52px] flex items-center justify-between z-50',
      style: {
        background: 'var(--faust-shadow)',
        borderBottom: '1px solid var(--faust-border)',
        WebkitAppRegion: 'drag',
        paddingLeft: '80px', // Space for native traffic lights
        paddingRight: '16px'
      }
    },
      // Empty spacer for traffic lights (native controls)
      e('div', { className: 'w-20' }),
      
      // Title (center)
      e('div', {
        className: 'absolute left-1/2 -translate-x-1/2 text-sm font-medium flex items-center gap-2',
        style: { color: 'var(--faust-text-primary)', WebkitAppRegion: 'no-drag' }
      },
        e(Icons.Book, { className: 'w-4 h-4' }),
        e('input', {
          value: project.title,
          onChange: (ev) => setProject({ ...project, title: ev.target.value }),
          className: 'bg-transparent border-none outline-none text-center font-medium',
          style: { color: 'var(--faust-text-primary)' },
          placeholder: 'Nimetön projekti'
        })
      ),
      
      // Toolbar Controls (right) - SIMPLIFIED per faust_ui_spec.json
      e('div', {
        className: 'flex items-center gap-3',
        style: { WebkitAppRegion: 'no-drag' }
      },
        // Word count badge
        e('div', {
          className: 'px-3 py-1 rounded text-xs font-mono tabular-nums',
          style: {
            background: 'rgba(154, 123, 79, 0.15)',
            color: 'var(--faust-text-primary)',
            border: '1px solid var(--faust-border)',
            fontFamily: 'var(--font-body)'
          },
          title: 'Sanamäärä'
        }, `${getTotalWordCount()} sanaa`),
        
        // Command Palette button
        e('button', {
          className: 'px-3 py-1 rounded text-xs transition-colors flex items-center gap-1',
          style: {
            background: 'rgba(154, 123, 79, 0.15)',
            color: 'var(--faust-text-primary)',
            border: '1px solid var(--faust-border)',
            fontFamily: 'var(--font-body)'
          },
          onClick: () => {
            setShowCommandPalette(true);
            setCommandQuery('');
          },
          title: 'Avaa komentopaletti (⌘K)'
        }, 
          e(Icons.Search, { className: 'w-4 h-4' }),
          e('span', null, '⌘K')
        ),
        
        // NOX/DEIS toggle (Faust spec: mode transition animation)
        e('button', {
          className: 'px-3 py-1 rounded text-xs transition-all flex items-center gap-1',
          style: {
            background: isDarkMode ? 'var(--faust-gold)' : 'rgba(154, 123, 79, 0.15)',
            color: isDarkMode ? '#141210' : 'var(--faust-text-primary)',
            border: '1px solid var(--faust-border)',
            fontFamily: 'var(--font-body)',
            fontWeight: '500'
          },
          onClick: () => {
            // Faust spec: 3-step mode transition
            // 1. Dim to 80%
            setIsTransitioning(true);
            document.body.style.opacity = '0.8';
            
            setTimeout(() => {
              // 2. Golden gradient swipe (800ms)
              document.body.setAttribute('data-transitioning', 'true');
              
              setTimeout(() => {
                // 3. Change mode and reilluminate
                setIsDarkMode(!isDarkMode);
                document.body.removeAttribute('data-transitioning');
                
                setTimeout(() => {
                  document.body.style.opacity = '1';
                  setIsTransitioning(false);
                }, 250);  // Reilluminate duration
              }, 800);  // Golden swipe duration
            }, 150);  // Dim duration
          },
          disabled: isTransitioning,
          title: isDarkMode ? 'DEIS (Valomoodi)' : 'NOX (Pimeämoodi)'
        }, 
          isDarkMode ? '🌙 NOX' : '☀️ DEIS'
        ),
        
        // Autosave indicator (fade in/out)
        showSaveIndicator && e('div', {
          className: 'px-3 py-1 rounded text-xs transition-all flex items-center gap-1',
          style: {
            background: saveStatus === 'error' 
              ? 'rgba(239, 68, 68, 0.15)' 
              : saveStatus === 'saving'
              ? 'rgba(59, 130, 246, 0.15)'
              : 'rgba(34, 197, 94, 0.15)',
            color: saveStatus === 'error'
              ? '#ef4444'
              : saveStatus === 'saving'
              ? '#3b82f6'
              : '#22c55b',
            border: `1px solid ${
              saveStatus === 'error'
              ? '#ef4444'
              : saveStatus === 'saving'
              ? '#3b82f6'
              : '#22c55b'
            }`,
            fontFamily: 'var(--font-body)',
            fontWeight: '500'
          }
        },
          saveStatus === 'saving' && e(Icons.Loader, { className: 'w-3 h-3' }),
          e('span', null, 
            saveStatus === 'saving' ? 'Tallentaa...' :
            saveStatus === 'error' ? '⚠ Virhe' :
            '✓ Tallennettu'
          )
        ),
        
        // Inspector toggle
        e('button', {
          className: 'w-8 h-8 rounded flex items-center justify-center transition-all',
          style: {
            background: showInspector ? 'var(--faust-gold)' : 'rgba(154, 123, 79, 0.15)',
            color: showInspector ? '#141210' : 'var(--faust-text-primary)',
            border: '1px solid var(--faust-border)'
          },
          onClick: () => setShowInspector(!showInspector),
          title: 'Inspector (Cmd+I)'
        }, e(Icons.Eye, { className: 'w-5 h-5' }))
      )
    ),

    // Main content area (below titlebar)
    // NATSUME + SAGMEISTER: Flow-transition + emotional arc background
    e('div', { 
      className: `flex flex-1 overflow-hidden flow-transition mode-${flowMode} tone-${emotionalTone}`, 
      style: { 
        marginTop: '52px',
        background: 'var(--faust-bg-primary)',
        transition: 'background 2s ease-in-out'
      } 
    },
      // Sidebar - macOS Source List with NORMAN Writer-Centric Navigation
      showSidebar && !zenMode && e('div', {  // Faust: Zen Mode hides left panel
        style: {
          width: `${sidebarWidth}px`,
          minWidth: '200px',
          maxWidth: '600px',
          position: 'relative',
          display: 'flex'
        }
      },
        e('aside', {
          className: 'overflow-y-auto panel-sidebar-left flex-1',
          style: {
            background: 'var(--faust-dark)',
            borderRight: '1px solid var(--faust-border)'
          }
        },
        e('div', { className: 'p-2' },
          // NORMAN: Writer-Centric Navigation Menu
          e('div', { className: 'mb-4 pb-4 border-b border-[rgba(255,255,255,0.05)]' },
            e('div', {
              className: 'text-[10px] font-semibold uppercase tracking-wide px-3 py-2',
              style: { color: 'var(--mac-text-tertiary)' }
            }, 'KIRJOITTAJAN TYÖTILA'),
            
            // TARINA (Story) Section
            e('button', {
              className: 'w-full px-3 py-2 rounded flex items-center gap-2 hover:bg-[rgba(255,255,255,0.05)] transition-colors text-sm',
              style: { color: 'var(--mac-text-primary)' },
              title: 'Tarina: Luvut, juonilangat, tapahtumat'
            },
              e('span', null, '📖'),
              e('span', null, 'Tarina')
            ),
            
            // MAAILMA (World) Section
            e('button', {
              className: 'w-full px-3 py-2 rounded flex items-center gap-2 hover:bg-[rgba(255,255,255,0.05)] transition-colors text-sm',
              onClick: () => setShowCharacterSheet(true),
              style: { color: 'var(--mac-text-primary)' },
              title: 'Maailma: Hahmot, paikat, aikajana'
            },
              e('span', null, '🌍'),
              e('span', null, 'Maailma'),
              e('span', { className: 'ml-auto text-xs opacity-50' }, `${project.characters?.length || 0}`)
            ),
            
            // TYÖKALUT (Tools) Section
            e('button', {
              className: 'w-full px-3 py-2 rounded flex items-center gap-2 hover:bg-[rgba(255,255,255,0.05)] transition-colors text-sm',
              onClick: () => setAiAssistantOpen(true),
              style: { color: 'var(--mac-text-primary)' },
              title: 'Työkalut: Tekniikat, analyysi, AI-apu'
            },
              e('span', null, '✨'),
              e('span', null, 'AI-Työkalut')
            )
          ),
          
          // Original file tree section
          e('div', {
            className: 'px-3 py-2 flex items-center justify-between',
            style: { color: 'var(--mac-text-tertiary)' }
          },
            e('div', {
              className: 'text-[11px] font-semibold uppercase tracking-wide'
            }, 'TIEDOSTOT'),
            e('button', {
              onClick: () => addItem(1, 'chapter'),
              className: 'w-5 h-5 rounded flex items-center justify-center hover:bg-[rgba(255,255,255,0.08)] transition-colors',
              title: 'Lisää luku'
            }, e(Icons.Plus, { className: 'w-3 h-3' }))
          ),
          renderTree(project.items)
        )
      ),

      // Collections Panel - macOS Source List
      showCollectionsPanel && e('aside', {
        className: 'w-60 overflow-y-auto',
        style: {
          background: 'var(--faust-dark)',
          borderRight: '1px solid var(--faust-border)'
        }
      },
        e('div', { className: 'p-2' },
          // Section header
          e('div', {
            className: 'px-3 py-2 flex items-center justify-between',
            style: { color: 'var(--mac-text-tertiary)' }
          },
            e('div', {
              className: 'text-[11px] font-semibold uppercase tracking-wide'
            }, 'KOKOELMAT'),
            e('button', {
              onClick: createCollection,
              className: 'w-5 h-5 rounded flex items-center justify-center hover:bg-[rgba(255,255,255,0.08)] transition-colors',
              title: 'Luo kokoelma'
            }, e(Icons.Plus, { className: 'w-3 h-3' }))
          ),
          (project.collections || []).length === 0
            ? e('div', {
                className: 'text-xs text-center py-4',
                style: { color: 'var(--mac-text-tertiary)' }
              }, 'Ei kokoelmia')
            : (project.collections || []).map(collection =>
                e('button', {
                  key: collection.id,
                  className: 'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all cursor-pointer',
                  style: {
                    background: 'transparent',
                    color: 'var(--mac-text-primary)'
                  },
                  onMouseEnter: (e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  },
                  onMouseLeave: (e) => {
                    e.currentTarget.style.background = 'transparent';
                  }
                },
                  e(Icons.Collection, { className: 'w-4 h-4' }),
                  e('div', { className: 'flex-1 text-left' },
                    e('div', { className: 'font-medium' }, collection.name),
                    e('div', {
                      className: 'text-[11px]',
                      style: { color: 'var(--mac-text-tertiary)' }
                    }, `${collection.itemIds.length} dokumenttia`)
                  )
                )
              )
        )
      ),

      // Editor - Vaihe 3: Compose Mode & Split View
      e('main', {
        className: `flex-1 overflow-hidden ${composeMode ? 'bg-gray-900' : ''}`,
        style: composeMode ? {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999
        } : {}
      },
        viewMode === 'editor' && (
          composeMode ? (
            // Compose Mode - Häiriötön kirjoitustila
            e('div', {
              className: 'h-full flex items-center justify-center p-8',
              style: {
                background: isDarkMode ? '#111827' : '#f9fafb',
                color: isDarkMode ? '#f9fafb' : '#111827'
              }
            },
              e('div', {
                className: 'w-full max-w-4xl',
                style: typewriterMode ? {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%'
                } : {}
              },
                // AI Diff-view - Pending edits
                pendingEdits.length > 0 && e('div', {
                  className: 'mb-4 p-4 rounded-lg border',
                  style: {
                    background: 'rgba(154, 123, 79, 0.1)',
                    borderColor: 'var(--faust-gold)'
                  }
                },
                  e('div', {
                    className: 'flex items-center justify-between mb-3'
                  },
                    e('div', {
                      className: 'font-semibold flex items-center gap-2',
                      style: { color: 'var(--faust-gold)' }
                    },
                      e('span', null, '✨'),
                      `${pendingEdits.length} AI-muutosehdotus(ta)`
                    ),
                    e('button', {
                      onClick: () => setPendingEdits([]),
                      className: 'text-xs px-2 py-1 rounded hover:bg-black/20',
                      style: { color: 'var(--faust-gold)' }
                    }, 'Hylkää kaikki')
                  ),
                  ...pendingEdits.map(edit =>
                    e('div', {
                      key: edit.id,
                      className: 'mb-3 pb-3 border-b border-white/10 last:border-b-0'
                    },
                      edit.explanation && e('div', {
                        className: 'text-sm font-medium mb-2',
                        style: { color: 'var(--faust-text-primary)' }
                      }, edit.explanation),
                      
                      // Diff view
                      e('div', { className: 'space-y-2 mb-2' },
                        // Original
                        e('div', {
                          className: 'p-2 rounded text-xs',
                          style: {
                            background: 'rgba(255, 99, 71, 0.1)',
                            borderLeft: '3px solid rgba(255, 99, 71, 0.5)',
                            color: 'var(--faust-text-secondary)',
                            fontFamily: 'var(--font-mono)'
                          }
                        },
                          e('div', {
                            className: 'text-[10px] uppercase tracking-wide mb-1',
                            style: { color: 'rgba(255, 99, 71, 0.8)' }
                          }, 'ALKUPERÄINEN'),
                          edit.original
                        ),
                        
                        // Suggested
                        e('div', {
                          className: 'p-2 rounded text-xs',
                          style: {
                            background: 'rgba(154, 205, 50, 0.1)',
                            borderLeft: '3px solid rgba(154, 205, 50, 0.5)',
                            color: 'var(--faust-text-primary)',
                            fontFamily: 'var(--font-mono)'
                          }
                        },
                          e('div', {
                            className: 'text-[10px] uppercase tracking-wide mb-1',
                            style: { color: 'rgba(154, 205, 50, 0.8)' }
                          }, 'EHDOTETTU'),
                          edit.suggested
                        )
                      ),
                      
                      // Actions
                      e('div', { className: 'flex gap-2' },
                        e('button', {
                          onClick: () => applyEdit(edit.id),
                          className: 'flex-1 px-3 py-2 rounded text-xs font-medium transition-all',
                          style: {
                            background: 'var(--faust-gold)',
                            color: '#141210'
                          }
                        }, '✓ Apply'),
                        e('button', {
                          onClick: () => rejectEdit(edit.id),
                          className: 'flex-1 px-3 py-2 rounded text-xs font-medium transition-all',
                          style: {
                            background: 'rgba(255, 99, 71, 0.3)',
                            color: 'var(--faust-text-primary)'
                          }
                        }, '✗ Reject')
                      )
                    )
                  )
                ),
              
                // Jatkuvuusvaroitukset
                continuityWarnings.length > 0 && e('div', {
                  className: 'mb-4 p-4 rounded-lg border',
                  style: {
                    background: 'rgba(255, 159, 64, 0.1)',
                    borderColor: 'rgba(255, 159, 64, 0.3)'
                  }
                },
                  e('div', {
                    className: 'flex items-center justify-between mb-2'
                  },
                    e('div', {
                      className: 'font-semibold',
                      style: { color: '#FF9F40' }
                    }, `⚠️ ${continuityWarnings.length} jatkuvuusvaroitus(ta)`),
                    e('button', {
                      onClick: () => setContinuityWarnings([]),
                      className: 'text-xs px-2 py-1 rounded hover:bg-black/20',
                      style: { color: '#FF9F40' }
                    }, 'Hylkää kaikki')
                  ),
                  ...continuityWarnings.flatMap(warning => 
                    warning.issues.map((issue, idx) =>
                      e('div', {
                        key: `${warning.character}-${idx}`,
                        className: 'mb-2 pb-2 border-b border-white/10 last:border-b-0'
                      },
                        e('div', {
                          className: 'text-sm font-medium mb-1',
                          style: { color: 'var(--faust-text-primary)' }
                        }, `${warning.character}: ${issue.type}`),
                        e('div', {
                          className: 'text-xs mb-1',
                          style: { color: 'var(--faust-text-secondary)' }
                        }, issue.problem),
                        issue.suggestion && e('div', {
                          className: 'text-xs italic',
                          style: { color: 'var(--faust-gold)' }
                        }, `💡 ${issue.suggestion}`)
                      )
                    )
                  )
                ),
              
                typewriterMode && e('div', {
                  className: 'text-center mb-8',
                  style: { fontSize: '14px', opacity: 0.7 }
                }, `${getActiveItem()?.title || 'Nimetön dokumentti'} • ${getActiveItem()?.wordCount || 0} sanaa`),

                e('textarea', {
                  ref: editorRef,
                  defaultValue: getActiveItem()?.content || '',
                  onChange: (ev) => {
                    updateItem(activeItemId, { content: ev.target.value });
                    
                    // Check for /command syntax
                    const content = ev.target.value;
                    const cursorPos = ev.target.selectionStart;
                    const beforeCursor = content.substring(0, cursorPos);
                    const lastSlashIndex = beforeCursor.lastIndexOf('/');
                    
                    if (lastSlashIndex !== -1) {
                      const afterSlash = beforeCursor.substring(lastSlashIndex + 1);
                      // Check if this looks like a command (no spaces after /)
                      if (!afterSlash.includes(' ') && !afterSlash.includes('\n')) {
                        setTemplateQuery(afterSlash);
                        setShowTemplateMenu(true);
                        
                        // Calculate position for menu
                        const textArea = ev.target;
                        const rect = textArea.getBoundingClientRect();
                        setTemplatePosition({
                          x: rect.left + 20,
                          y: rect.top + 100
                        });
                      } else {
                        setShowTemplateMenu(false);
                      }
                    } else {
                      setShowTemplateMenu(false);
                    }
                  },
                  onKeyDown: (ev) => {
                    // Escape to close template menu
                    if (ev.key === 'Escape' && showTemplateMenu) {
                      ev.preventDefault();
                      setShowTemplateMenu(false);
                      setTemplateQuery('');
                    }
                  },
                  placeholder: 'Aloita kirjoittaminen... (käytä / pikakomennoille)',
                  className: `w-full resize-none outline-none ${
                    isDarkMode
                      ? 'bg-transparent text-gray-100 placeholder-gray-600'
                      : 'bg-transparent text-gray-900 placeholder-gray-400'
                  }`,
                  style: {
                    fontFamily: fontOptions.find(f => f.id === editorFont)?.family || 'serif',
                    fontSize: `${fontSize}px`,
                    lineHeight: lineHeight,
                    ...(typewriterMode ? {
                      textAlign: 'center',
                      minHeight: '60vh'
                    } : {
                      minHeight: '80vh'
                    })
                  }
                }),
                
                // Template menu (floating)
                showTemplateMenu && e('div', {
                  className: 'fixed z-50 rounded-lg border shadow-xl',
                  style: {
                    top: `${templatePosition.y}px`,
                    left: `${templatePosition.x}px`,
                    background: 'var(--faust-dark)',
                    borderColor: 'var(--faust-gold)',
                    minWidth: '300px',
                    maxHeight: '400px',
                    overflowY: 'auto'
                  }
                },
                  e('div', {
                    className: 'p-2',
                    style: { color: 'var(--faust-text-tertiary)', fontSize: '10px' }
                  }, 'PIKAKOMENNOT'),
                  ...Object.keys(TEMPLATES)
                    .filter(key => key.includes(templateQuery.toLowerCase()))
                    .map(key => {
                      const template = TEMPLATES[key];
                      return e('div', {
                        key,
                        onClick: () => executeTemplate(key),
                        className: 'p-3 cursor-pointer transition-all',
                        style: {
                          borderBottom: '1px solid rgba(255,255,255,0.05)'
                        },
                        onMouseEnter: (e) => {
                          e.currentTarget.style.background = 'rgba(154, 123, 79, 0.2)';
                        },
                        onMouseLeave: (e) => {
                          e.currentTarget.style.background = 'transparent';
                        }
                      },
                        e('div', {
                          className: 'font-medium mb-1',
                          style: { color: 'var(--faust-gold)', fontSize: '13px' }
                        }, `/${key}`),
                        e('div', {
                          style: { color: 'var(--faust-text-secondary)', fontSize: '11px' }
                        }, template.description)
                      );
                    })
                )
              )
            )
          ) : splitView && splitViewItem ? (
            // Split View - Kaksi dokumenttia vierekkäin
            e('div', { className: 'flex h-full' },
              // Vasen paneeli (aktiivinen dokumentti)
              e('div', { className: 'flex-1 border-r border-gray-700 overflow-y-auto' },
                e('div', { className: 'max-w-4xl mx-auto p-8' },
                  e('div', { className: 'mb-4' },
                    e('input', {
                      value: getActiveItem()?.title || '',
                      onChange: (ev) => updateItem(activeItemId, { title: ev.target.value }),
                      className: `text-2xl font-bold w-full bg-transparent border-b-2 border-transparent hover:border-blue-500 focus:border-blue-500 outline-none mb-2 ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`
                    }),
                    e('div', { className: 'text-sm opacity-60' }, `${getActiveItem()?.wordCount || 0} sanaa`)
                  ),
                  e('textarea', {
                    ref: editorRef,
                    defaultValue: getActiveItem()?.content || '',
                    onChange: (ev) => updateItem(activeItemId, { content: ev.target.value }),
                    placeholder: 'Aloita kirjoittaminen...',
                    className: `w-full min-h-[600px] p-6 rounded-lg border-2 resize-none outline-none ${
                      isDarkMode
                        ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-600'
                        : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
                    }`,
                    style: {
                      fontFamily: fontOptions.find(f => f.id === editorFont)?.family || 'serif',
                      fontSize: `${fontSize}px`,
                      lineHeight: lineHeight
                    }
                  })
                )
              ),

              // Oikea paneeli (toinen dokumentti)
              e('div', { className: 'flex-1 overflow-y-auto' },
                e('div', { className: 'max-w-4xl mx-auto p-8' },
                  e('div', { className: 'mb-4' },
                    e('input', {
                      value: splitViewItem.title || '',
                      onChange: (ev) => updateItem(splitViewItem.id, { title: ev.target.value }),
                      className: `text-2xl font-bold w-full bg-transparent border-b-2 border-transparent hover:border-blue-500 focus:border-blue-500 outline-none mb-2 ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`
                    }),
                    e('div', { className: 'text-sm opacity-60' }, `${splitViewItem.wordCount || 0} sanaa`)
                  ),
                  e('textarea', {
                    defaultValue: splitViewItem.content || '',
                    onChange: (ev) => updateItem(splitViewItem.id, { content: ev.target.value }),
                    placeholder: 'Aloita kirjoittaminen...',
                    className: `w-full min-h-[600px] p-6 rounded-lg border-2 resize-none outline-none ${
                      isDarkMode
                        ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-600'
                        : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
                    }`,
                    style: {
                      fontFamily: fontOptions.find(f => f.id === editorFont)?.family || 'serif',
                      fontSize: `${fontSize}px`,
                      lineHeight: lineHeight
                    }
                  })
                )
              )
            )
          ) : (
            // Normaali editori
            e('div', { className: 'max-w-4xl mx-auto p-8 relative' },
              e('div', { className: 'mb-4' },
                e('input', {
                  value: getActiveItem()?.title || '',
                  onChange: (ev) => updateItem(activeItemId, { title: ev.target.value }),
                  className: `text-2xl font-bold w-full bg-transparent border-b-2 border-transparent hover:border-blue-500 focus:border-blue-500 outline-none mb-2 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`
                }),
                e('div', { className: 'text-sm opacity-60' }, `${getActiveItem()?.wordCount || 0} sanaa`)
              ),
              
              // Continuity warnings
              continuityWarnings.length > 0 && e('div', {
                className: 'mb-4 p-3 rounded-lg',
                style: {
                  background: 'rgba(251, 191, 36, 0.9)',
                  color: '#78350f',
                  border: '2px solid #f59e0b'
                }
              },
                e('div', { className: 'text-xs font-bold mb-2 flex items-center gap-2' },
                  '⚠️ Jatkuvuusvaroitukset',
                  e('button', {
                    onClick: () => setContinuityWarnings([]),
                    className: 'ml-auto px-2 py-1 rounded text-[10px]',
                    style: {
                      background: 'rgba(0,0,0,0.1)',
                      color: '#78350f'
                    }
                  }, 'Piilota')
                ),
                ...continuityWarnings.map((warning, i) =>
                  e('div', { key: i, className: 'text-xs mt-1' }, warning)
                )
              ),
              
              e('textarea', {
                ref: editorRef,
                defaultValue: getActiveItem()?.content || '',
                onChange: (ev) => {
                  const newContent = ev.target.value;
                  updateItem(activeItemId, { content: newContent });
                  
                  // Faust spec: /ai inline mode trigger detection
                  if (newContent.endsWith('/ai ')) {
                    setAiInlineActive(true);
                    setAiGhostText('Generating...');
                    
                    // Call AI to generate suggestion
                    const context = newContent.slice(0, -4);  // Remove "/ai "
                    const prompt = `Continue this text naturally:\n\n${context}`;
                    
                    window.electronAPI.generateWithAI({ 
                      prompt,
                      model: selectedAIApi || 'claude-3-5-sonnet-20241022'
                    }).then(result => {
                      if (result && typeof result === 'string') {
                        setAiGhostText(result);
                      } else {
                        setAiGhostText('');
                        setAiInlineActive(false);
                      }
                    }).catch((error) => {
                      console.error('AI inline error:', error);
                      setAiGhostText('');
                      setAiInlineActive(false);
                    });
                  }
                },
                onMouseUp: handleTextSelection,
                onKeyUp: handleTextSelection,
                onKeyDown: (ev) => {
                  // Faust spec: Tab = accept, Esc = reject ghost text
                  if (aiInlineActive && aiGhostText) {
                    if (ev.key === 'Tab') {
                      ev.preventDefault();
                      const currentContent = editorRef.current.value.slice(0, -4);  // Remove "/ai "
                      const newContent = currentContent + aiGhostText;
                      updateItem(activeItemId, { content: newContent });
                      setAiInlineActive(false);
                      setAiGhostText('');
                      console.log('✅ Tab - Ghost text accepted');
                    } else if (ev.key === 'Escape') {
                      ev.preventDefault();
                      setAiInlineActive(false);
                      setAiGhostText('');
                      console.log('❌ Esc - Ghost text rejected');
                    }
                  }
                },
                placeholder: 'Aloita kirjoittaminen...',
                className: `w-full min-h-[600px] p-6 rounded-lg border-2 resize-none outline-none ${
                  isDarkMode
                    ? 'bg-gray-800 border-gray-700 text-gray-100 placeholder-gray-600'
                    : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
                }`,
                style: {
                  fontFamily: fontOptions.find(f => f.id === editorFont)?.family || 'serif',
                  fontSize: `${fontSize}px`,
                  lineHeight: lineHeight
                }
              }),
              
              // Faust spec: Ghost text overlay
              aiInlineActive && aiGhostText && aiGhostText !== 'Generating...' && e('div', {
                className: 'absolute pointer-events-none',
                style: {
                  top: '150px',  // Approximate position after title
                  left: '8px',
                  right: '8px',
                  color: isDarkMode ? 'rgba(200, 157, 94, 0.5)' : 'rgba(113, 92, 56, 0.5)',
                  fontFamily: fontOptions.find(f => f.id === editorFont)?.family || 'serif',
                  fontSize: `${fontSize}px`,
                  lineHeight: lineHeight,
                  whiteSpace: 'pre-wrap',
                  paddingLeft: '6px'
                }
              }, aiGhostText)
            )
          )
        )
      ),

      // Inspector - macOS style
      showInspector && !zenMode && e('div', {  // Faust: Zen Mode hides right panel
        style: {
          width: `${inspectorWidth}px`,
          minWidth: '280px',
          maxWidth: '800px',
          position: 'relative',
          display: 'flex'
        }
      },
        // Resize handle for inspector
        e('div', {
          className: 'absolute top-0 left-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--faust-gold)] transition-colors',
          style: {
            background: 'transparent',
            zIndex: 10
          },
          onMouseDown: (e) => {
            e.preventDefault();
            setIsResizingInspector(true);
          }
        }),
        e('aside', {
          className: 'flex-1 flex flex-col panel-sidebar-right',
          style: {
            background: 'var(--faust-shadow)',
            borderLeft: '1px solid var(--faust-border)'
          }
        },
        // Inspector tabs - macOS style
        e('div', {
          className: 'flex border-b overflow-x-auto',
          style: {
            borderColor: 'var(--faust-border)',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--faust-bronze) transparent'
          }
        },
          ['notes', 'metadata', 'tilannekuvat', 'targets', 'appearance', 'agents', 'grimoire', 'contextus', 'characters', 'locations', 'story'].map(tab => {
            const isActive = inspectorTab === tab;
            const tabLabel = tab === 'notes' ? 'Muistiinpanot' : 
                           tab === 'metadata' ? 'Metatiedot' : 
                           tab === 'tilannekuvat' ? 'Tilannekuvat' : 
                           tab === 'targets' ? 'Tavoitteet' : 
                           tab === 'appearance' ? 'Ulkoasu' : 
                           tab === 'agents' ? 'AI-Agentit' :
                           tab === 'grimoire' ? 'Grimoire' :
                           tab === 'contextus' ? 'Contextus' :
                           tab === 'characters' ? 'Hahmot' :
                           tab === 'locations' ? 'Paikat' :
                           'Tarina';
            
            return e('button', {
              key: tab,
              onClick: () => setInspectorTab(tab),
              className: 'px-3 py-2.5 text-xs font-medium relative transition-colors whitespace-nowrap',
              style: {
                background: isActive ? 'var(--faust-shadow)' : 'transparent',
                border: 'none',
                color: isActive ? 'var(--faust-text-primary)' : 'var(--faust-text-secondary)',
                cursor: 'pointer',
                flexShrink: 0
              },
              onMouseEnter: (e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--faust-text-primary)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                }
              },
              onMouseLeave: (e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--faust-text-secondary)';
                  e.currentTarget.style.background = 'transparent';
                }
              }
            }, 
              tabLabel,
              isActive && e('div', {
                className: 'absolute bottom-0 left-0 right-0 h-0.5',
                style: { background: 'var(--faust-gold)' }
              })
            );
          })
        ),
        
        // Inspector content
        e('div', { className: 'flex-1 overflow-y-auto p-4 space-y-4' },

          inspectorTab === 'notes' && e('div', null,
            e('h4', { className: 'text-sm font-semibold mb-2' }, 'Dokumentin muistiinpanot'),
            e('textarea', {
              value: getActiveItem()?.notes || '',
              onChange: (ev) => updateItem(activeItemId, { notes: ev.target.value }),
              placeholder: 'Kirjoita muistiinpanoja tähän...',
              className: `w-full h-40 p-3 rounded border resize-none ${
                isDarkMode ? 'bg-gray-900 border-gray-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-900'
              }`,
              style: {
                fontFamily: fontOptions.find(f => f.id === editorFont)?.family || 'serif',
                fontSize: `${Math.max(fontSize - 2, 12)}px`,
                lineHeight: lineHeight
              }
            })
          ),

          inspectorTab === 'metadata' && e('div', { className: 'space-y-3' },
            e('div', null,
              e('label', { className: 'text-sm font-semibold block mb-1' }, 'Tila'),
              e('select', {
                value: getActiveItem()?.status || 'draft',
                onChange: (ev) => updateItem(activeItemId, { status: ev.target.value }),
                className: `w-full p-2 rounded border text-sm ${
                  isDarkMode ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                }`
              }, statusOptions.map(opt => e('option', { key: opt.value, value: opt.value }, opt.label)))
            ),
            e('div', null,
              e('label', { className: 'text-sm font-semibold block mb-1' }, 'Merkintä'),
              e('select', {
                value: getActiveItem()?.label || 'none',
                onChange: (ev) => updateItem(activeItemId, { label: ev.target.value }),
                className: `w-full p-2 rounded border text-sm ${
                  isDarkMode ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
                }`
              }, LABEL_COLORS.map(label => e('option', { key: label.id, value: label.id }, label.name)))
            )
          ),

          inspectorTab === 'tilannekuvat' && e('div', { className: 'space-y-3' },
            e('div', { className: 'flex items-center justify-between mb-3' },
              e('h4', { className: 'text-sm font-semibold' }, 'Tilannekuvat'),
              e('button', {
                onClick: () => {
                  const item = getActiveItem();
                  if (item) {
                    const newSnapshot = {
                      id: Date.now(),
                      title: `Tilannekuva ${new Date().toLocaleString('fi-FI')}`,
                      content: item.content,
                      wordCount: (item.content || '').split(/\s+/).filter(w => w.length > 0).length,
                      timestamp: Date.now()
                    };
                    const updatedSnapshots = [...(item.tilannekuvat || []), newSnapshot];
                    updateItem(activeItemId, { tilannekuvat: updatedSnapshots });
                  }
                },
                className: 'px-3 py-1 rounded text-xs font-medium transition-all',
                style: {
                  background: 'var(--faust-gold)',
                  color: 'var(--faust-dark)',
                  border: '1px solid var(--faust-bronze)'
                },
                title: 'Tallenna nykyinen tila tilannekuvaksi'
              }, '+ Lisää tilannekuva')
            ),
            (getActiveItem()?.tilannekuvat || []).length === 0
              ? e('div', { 
                  className: 'text-xs text-center py-8',
                  style: { color: 'var(--faust-text-tertiary)' }
                }, 'Ei tilannekuvia. Luo ensimmäinen tallentamalla nykyinen tila.')
              : e('div', { className: 'space-y-2' },
                  (getActiveItem()?.tilannekuvat || []).map(tilannekuva =>
                    e('div', {
                      key: tilannekuva.id,
                      className: 'p-3 rounded border transition-all',
                      style: {
                        background: 'var(--faust-paper)',
                        borderColor: 'var(--faust-border)',
                        color: 'var(--faust-text-primary)'
                      }
                    },
                      e('div', { className: 'flex items-start justify-between mb-2' },
                        e('div', { className: 'flex-1' },
                          e('div', { 
                            className: 'text-sm font-medium mb-1',
                            style: { color: 'var(--faust-text-primary)' }
                          }, tilannekuva.title),
                          e('div', { 
                            className: 'text-xs',
                            style: { color: 'var(--faust-text-tertiary)' }
                          }, `${tilannekuva.wordCount || 0} sanaa • ${new Date(tilannekuva.timestamp).toLocaleString('fi-FI')}`)
                        ),
                        e('div', { className: 'flex gap-1' },
                          e('button', {
                            onClick: () => {
                              if (confirm('Palauta tämä tilannekuva? Nykyinen sisältö ylikirjoitetaan.')) {
                                updateItem(activeItemId, { content: tilannekuva.content });
                              }
                            },
                            className: 'text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity',
                            style: {
                              background: 'var(--faust-gold)',
                              color: 'var(--faust-dark)'
                            },
                            title: 'Palauta tämä tilannekuva'
                          }, '↺'),
                          e('button', {
                            onClick: () => {
                              if (confirm('Poista tämä tilannekuva?')) {
                                const item = getActiveItem();
                                const updatedSnapshots = (item.tilannekuvat || []).filter(s => s.id !== tilannekuva.id);
                                updateItem(activeItemId, { tilannekuvat: updatedSnapshots });
                              }
                            },
                            className: 'text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity',
                            style: {
                              background: 'var(--faust-brass)',
                              color: 'var(--faust-dark)'
                            },
                            title: 'Poista tilannekuva'
                          }, '🗑')
                        )
                      )
                    )
                  )
                )
          ),
          
          inspectorTab === 'targets' && e('div', { className: 'space-y-4' },
            e('h4', { className: 'text-sm font-semibold mb-3' }, 'Kirjoitustavoitteet'),

            // Istunnon edistyminen
            e('div', { className: 'p-3 rounded border ' + (isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200') },
              e('h5', { className: 'text-xs font-medium mb-2 opacity-75' }, 'Nykyinen istunto'),
              ProgressBar({
                value: sessionStats.wordsWritten,
                max: targets.session,
                label: 'Istuntotavoite',
                color: 'green'
              }),
              e('div', { className: 'text-xs opacity-75 mt-2' },
                `Kesto: ${Math.floor(sessionStats.duration / 60)} min | `,
                `Nopeus: ${Math.round(sessionStats.wordsWritten / (sessionStats.duration / 60) || 0)} sanaa/min`
              )
            ),

            // Päivätavoite
            e('div', { className: 'p-3 rounded border ' + (isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200') },
              e('h5', { className: 'text-xs font-medium mb-2 opacity-75' }, 'Päivätavoite'),
              ProgressBar({
                value: dailyStats.words,
                max: targets.daily,
                label: 'Päivän sanat',
                color: 'blue'
              })
            ),

            // Projektitavoite
            e('div', { className: 'p-3 rounded border ' + (isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200') },
              e('h5', { className: 'text-xs font-medium mb-2 opacity-75' }, 'Projektin edistyminen'),
              ProgressBar({
                value: getTotalWordCount(),
                max: targets.project,
                label: 'Kokonaissanamäärä',
                color: 'purple'
              }),
              e('div', { className: 'text-xs opacity-75 mt-2' },
                `Jäljellä: ${targets.project - getTotalWordCount()} sanaa | `,
                `Arvioitu valmis: ${Math.ceil((targets.project - getTotalWordCount()) / targets.daily)} päivässä`
              )
            ),

            // Tavoitteiden muokkaus
            e('div', { className: 'p-3 rounded border ' + (isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200') },
              e('h5', { className: 'text-xs font-medium mb-2 opacity-75' }, 'Muokkaa tavoitteita'),
              e('div', { className: 'space-y-2' },
                e('input', {
                  type: 'number',
                  value: targets.session,
                  onChange: (ev) => setTargets({...targets, session: parseInt(ev.target.value)}),
                  className: 'w-full p-2 rounded border text-sm ' + (isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'),
                  placeholder: 'Istuntotavoite'
                }),
                e('input', {
                  type: 'number',
                  value: targets.daily,
                  onChange: (ev) => setTargets({...targets, daily: parseInt(ev.target.value)}),
                  className: 'w-full p-2 rounded border text-sm ' + (isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'),
                  placeholder: 'Päivätavoite'
                }),
                e('input', {
                  type: 'number',
                  value: targets.project,
                  onChange: (ev) => setTargets({...targets, project: parseInt(ev.target.value)}),
                  className: 'w-full p-2 rounded border text-sm ' + (isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'),
                  placeholder: 'Projektitavoite'
                })
              )
            )
          ),
          inspectorTab === 'contextus' && e('div', { className: 'space-y-4' },
            e('h4', {
              className: 'text-sm font-semibold mb-3 flex items-center gap-2',
              style: { color: 'var(--faust-text-primary)' }
            },
              e('span', null, '🜏'),
              'Contextus - Metadata'
            ),

            // Current document metadata
            (() => {
              const activeItem = getActiveItem();
              if (!activeItem || !activeItem?.content) {
                return e('div', {
                  className: 'text-xs text-center py-4',
                  style: { color: 'var(--faust-text-tertiary)' }
                }, 'Ei sisältöä analysoitavaksi');
              }

              const links = parseLinks(activeItem.content);
              const { tags, mentions } = parseMetadata(activeItem.content);
              const allTags = getAllTags();

              return e('div', null,
                // Tags in current document
                e('div', {
                  className: 'p-3 rounded border mb-3',
                  style: {
                    background: 'var(--faust-shadow)',
                    borderColor: 'var(--faust-border)'
                  }
                },
                  e('div', {
                    className: 'font-medium mb-2',
                    style: { color: 'var(--faust-gold)' }
                  }, '#Tagit tässä dokumentissa'),
                  tags.length === 0
                    ? e('div', {
                        className: 'text-xs',
                        style: { color: 'var(--faust-text-tertiary)' }
                      }, 'Ei tageja. Käytä #tagi syntaksia.')
                    : e('div', { className: 'flex flex-wrap gap-2' },
                        ...tags.map((tag, idx) =>
                          e('span', {
                            key: idx,
                            className: 'inline-tag text-xs',
                            onClick: () => {
                              const docs = getDocumentsWithTag(tag.tag);
                              console.log(`Tag #${tag.tag} found in ${docs.length} documents:`, docs);
                            }
                          }, tag.text)
                        )
                      )
                ),

                // Mentions in current document
                e('div', {
                  className: 'p-3 rounded border mb-3',
                  style: {
                    background: 'var(--faust-shadow)',
                    borderColor: 'var(--faust-border)'
                  }
                },
                  e('div', {
                    className: 'font-medium mb-2',
                    style: { color: 'var(--faust-brass)' }
                  }, '@Maininnat tässä dokumentissa'),
                  mentions.length === 0
                    ? e('div', {
                        className: 'text-xs',
                        style: { color: 'var(--faust-text-tertiary)' }
                      }, 'Ei mainintoja. Käytä @nimi syntaksia.')
                    : e('div', { className: 'space-y-1' },
                        ...mentions.map((mention, idx) =>
                          e('div', {
                            key: idx,
                            className: 'inline-mention text-xs',
                            onClick: () => {
                              if (mention.entity) {
                                if (mention.entity.type === 'character') {
                                  setInspectorTab('characters');
                                } else if (mention.entity.type === 'location') {
                                  setInspectorTab('locations');
                                }
                              }
                            }
                          }, 
                            mention.entity 
                              ? `${mention.text} (${mention.entity.type === 'character' ? 'hahmo' : 'paikka'})`
                              : `${mention.text} (ei löytynyt)`
                          )
                        )
                      )
                ),

                // All project tags
                allTags.length > 0 && e('div', {
                  className: 'p-3 rounded border mb-3',
                  style: {
                    background: 'var(--faust-shadow)',
                    borderColor: 'var(--faust-border)'
                  }
                },
                  e('div', {
                    className: 'font-medium mb-2',
                    style: { color: 'var(--faust-text-primary)' }
                  }, `Kaikki tagit projektissa (${allTags.length})`),
                  e('div', { className: 'flex flex-wrap gap-2' },
                    ...allTags.map((tag, idx) => {
                      const count = getDocumentsWithTag(tag).length;
                      return e('span', {
                        key: idx,
                        className: 'inline-tag text-xs cursor-pointer',
                        style: { opacity: tags.some(t => t.tag === tag) ? 1 : 0.5 },
                        onClick: () => {
                          const docs = getDocumentsWithTag(tag);
                          console.log(`Tag #${tag} used in ${docs.length} documents`, docs);
                        }
                      }, `#${tag} (${count})`);
                    })
                  )
                ),

                // Links in current document
                e('div', {
                  className: 'p-3 rounded border mb-3',
                  style: {
                    background: 'var(--faust-shadow)',
                    borderColor: 'var(--faust-border)'
                  }
                },
                  e('div', {
                    className: 'font-medium mb-2',
                    style: { color: 'var(--faust-text-primary)' }
                  }, '[[Linkit]] tässä dokumentissa'),
                  links.length === 0 
                    ? e('div', {
                        className: 'text-xs',
                        style: { color: 'var(--faust-text-tertiary)' }
                      }, 'Ei linkityksiä. Käytä [[nimi]] syntaksia.')
                    : e('div', { className: 'space-y-2' },
                        ...links.map((link, idx) =>
                          e('div', {
                            key: idx,
                            className: 'p-2 rounded text-xs cursor-pointer transition-all',
                            style: {
                              background: link.entity.type === 'character' 
                                ? 'rgba(100, 200, 255, 0.1)' 
                                : 'rgba(255, 200, 100, 0.1)',
                              border: link.entity.type === 'character'
                                ? '1px solid rgba(100, 200, 255, 0.3)'
                                : '1px solid rgba(255, 200, 100, 0.3)'
                            },
                            onClick: () => {
                              if (link.entity.type === 'character') {
                                setInspectorTab('characters');
                              } else if (link.entity.type === 'location') {
                                setInspectorTab('locations');
                              }
                            }
                          },
                            e('div', {
                              className: 'font-medium mb-1',
                              style: { color: 'var(--faust-text-primary)' }
                            }, 
                              `${link.entity.type === 'character' ? '👤' : '📍'} ${link.entityName}`
                            ),
                            e('div', {
                              style: { color: 'var(--faust-text-tertiary)' }
                            }, link.entity.type === 'character' ? 'Hahmo' : 'Paikka')
                          )
                        )
                      )
                ),

                // Quick reference guide
                e('div', {
                  className: 'p-3 rounded border',
                  style: {
                    background: 'var(--faust-shadow)',
                    borderColor: 'var(--faust-border)'
                  }
                },
                  e('div', {
                    className: 'font-medium mb-2',
                    style: { color: 'var(--faust-text-primary)' }
                  }, 'Pikaohje - Metadata syntaksi'),
                  e('div', {
                    className: 'text-xs space-y-1',
                    style: { color: 'var(--faust-text-secondary)' }
                  },
                    e('div', null, '• #tagi → Kategorisoi dokumentti'),
                    e('div', null, '• @nimi → Viittaa hahmoon tai paikkaan'),
                    e('div', null, '• [[nimi]] → Linkitä entiteettiin'),
                    e('div', null, '• Klikkaa tageä nähdäksesi kaikki käyttökerrat')
                  )
                ),

                // Graph view toggle
                e('div', {
                  className: 'mt-4'
                },
                  e('button', {
                    onClick: () => setShowGraphView(!showGraphView),
                    className: 'w-full p-3 rounded-lg font-medium transition-all',
                    style: {
                      background: showGraphView 
                        ? 'var(--faust-gold)' 
                        : 'rgba(154, 123, 79, 0.2)',
                      color: showGraphView 
                        ? 'var(--faust-dark)' 
                        : 'var(--faust-gold)',
                      border: '1px solid var(--faust-gold)'
                    }
                  }, 
                    showGraphView ? '🜍 Sulje Verkkonäkymä' : '🜍 Avaa Verkkonäkymä'
                  )
                )
              );
            })()
          ),
          // Timeline / Kanban View Modal
          showTimelineView && (() => {
            const chapters = buildTimelineData();
            const statusCounts = {
              draft: chapters.filter(c => c.status === 'draft').length,
              review: chapters.filter(c => c.status === 'review').length,
              done: chapters.filter(c => c.status === 'done').length
            };

            return e('div', {
              className: 'fixed inset-0 bg-black/80 flex items-center justify-center z-50',
              onClick: () => setShowTimelineView(false)
            },
              e('div', {
                className: 'rounded-lg border shadow-2xl',
                style: {
                  background: 'var(--faust-dark)',
                  borderColor: 'var(--faust-gold)',
                  width: '95vw',
                  height: '90vh',
                  maxWidth: '1600px',
                  display: 'flex',
                  flexDirection: 'column'
                },
                onClick: (e) => e.stopPropagation()
              },
                // Header
                e('div', {
                  className: 'p-4 border-b flex items-center justify-between',
                  style: { borderColor: 'var(--faust-border)' }
                },
                  e('div', {
                    className: 'flex items-center gap-3'
                  },
                    e('h3', {
                      className: 'text-lg font-semibold',
                      style: { color: 'var(--faust-gold)' }
                    }, '🜕 Rakennenäkymä'),
                    e('div', {
                      className: 'flex gap-2'
                    },
                      ['timeline', 'kanban'].map(mode =>
                        e('button', {
                          key: mode,
                          onClick: () => setTimelineViewMode(mode),
                          className: 'px-3 py-1 rounded text-xs font-medium transition-all',
                          style: {
                            background: timelineViewMode === mode 
                              ? 'var(--faust-gold)' 
                              : 'rgba(154, 123, 79, 0.2)',
                            color: timelineViewMode === mode 
                              ? 'var(--faust-dark)' 
                              : 'var(--faust-text-secondary)'
                          }
                        }, 
                          mode === 'timeline' ? 'Aikajana' : 'Kanban'
                        )
                      )
                    )
                  ),
                  e('button', {
                    onClick: () => setShowTimelineView(false),
                    className: 'px-4 py-2 rounded hover:bg-white/10 transition-all',
                    style: { color: 'var(--faust-text-secondary)' }
                  }, '✕ Sulje')
                ),

                // Content
                e('div', {
                  className: 'flex-1 overflow-auto p-4',
                  style: { background: 'var(--faust-bg-primary)' }
                },
                  timelineViewMode === 'timeline' ? (
                    // Timeline View
                    e('div', { className: 'space-y-4' },
                      chapters.map((chapter, idx) =>
                        e('div', {
                          key: chapter.id,
                          className: 'p-4 rounded-lg border cursor-pointer transition-all hover:border-[var(--faust-gold)]',
                          style: {
                            background: 'var(--faust-shadow)',
                            borderColor: 'var(--faust-border)',
                            borderLeft: `4px solid ${
                              chapter.status === 'done' ? 'var(--faust-gold)' :
                              chapter.status === 'review' ? 'var(--faust-brass)' :
                              'var(--faust-bronze)'
                            }`
                          },
                          onClick: () => {
                            setActiveItemId(chapter.id);
                            setShowTimelineView(false);
                          }
                        },
                          e('div', {
                            className: 'flex items-start justify-between mb-2'
                          },
                            e('div', { className: 'flex-1' },
                              e('div', {
                                className: 'font-semibold mb-1',
                                style: { color: 'var(--faust-text-primary)' }
                              }, chapter.title),
                              e('div', {
                                className: 'text-xs',
                                style: { color: 'var(--faust-text-tertiary)' }
                              }, `${chapter.wordCount} sanaa • Luku ${idx + 1}`)
                            ),
                            e('div', {
                              className: 'flex items-center gap-2'
                            },
                              // Status badge
                              e('select', {
                                value: chapter.status,
                                onChange: (ev) => {
                                  ev.stopPropagation();
                                  updateChapterStatus(chapter.id, ev.target.value);
                                },
                                className: 'px-2 py-1 rounded text-xs font-medium',
                                style: {
                                  background: chapter.status === 'done' ? 'var(--faust-gold)' :
                                             chapter.status === 'review' ? 'var(--faust-brass)' :
                                             'var(--faust-bronze)',
                                  color: 'var(--faust-dark)',
                                  border: 'none',
                                  cursor: 'pointer'
                                }
                              },
                                e('option', { value: 'draft' }, 'Luonnos'),
                                e('option', { value: 'review' }, 'Tarkistus'),
                                e('option', { value: 'done' }, 'Valmis')
                              )
                            )
                          ),
                          // Tags
                          chapter.tags.length > 0 && e('div', {
                            className: 'flex flex-wrap gap-1 mb-2'
                          },
                            ...chapter.tags.map(tag =>
                              e('span', {
                                key: tag.tag,
                                className: 'inline-tag text-xs'
                              }, tag.text)
                            )
                          ),
                          // Characters
                          chapter.characters.length > 0 && e('div', {
                            className: 'text-xs',
                            style: { color: 'var(--faust-text-secondary)' }
                          }, `Hahmot: ${chapter.characters.map(c => c.name).join(', ')}`)
                        )
                      )
                    )
                  ) : (
                    // Kanban View
                    e('div', {
                      className: 'grid grid-cols-3 gap-4 h-full'
                    },
                      ['draft', 'review', 'done'].map(status => {
                        const statusChapters = chapters.filter(c => c.status === status);
                        return e('div', {
                          key: status,
                          className: 'flex flex-col'
                        },
                          // Column header
                          e('div', {
                            className: 'p-3 rounded-t-lg font-semibold flex items-center justify-between mb-2',
                            style: {
                              background: status === 'done' ? 'var(--faust-gold)' :
                                         status === 'review' ? 'var(--faust-brass)' :
                                         'var(--faust-bronze)',
                              color: 'var(--faust-dark)'
                            }
                          },
                            e('span', null, 
                              status === 'draft' ? 'Luonnos' :
                              status === 'review' ? 'Tarkistus' : 'Valmis'
                            ),
                            e('span', {
                              className: 'px-2 py-1 rounded text-xs',
                              style: {
                                background: 'rgba(0,0,0,0.2)'
                              }
                            }, statusChapters.length)
                          ),
                          // Cards
                          e('div', {
                            className: 'flex-1 space-y-2 overflow-y-auto',
                            style: {
                              minHeight: '400px',
                              maxHeight: 'calc(90vh - 200px)'
                            }
                          },
                            ...statusChapters.map((chapter, idx) =>
                              e('div', {
                                key: chapter.id,
                                className: 'p-3 rounded-lg border cursor-pointer transition-all',
                                style: {
                                  background: 'var(--faust-shadow)',
                                  borderColor: 'var(--faust-border)'
                                },
                                onClick: () => {
                                  setActiveItemId(chapter.id);
                                  setShowTimelineView(false);
                                },
                                onMouseEnter: (e) => {
                                  e.currentTarget.style.borderColor = 'var(--faust-gold)';
                                },
                                onMouseLeave: (e) => {
                                  e.currentTarget.style.borderColor = 'var(--faust-border)';
                                }
                              },
                                e('div', {
                                  className: 'font-medium mb-2',
                                  style: { color: 'var(--faust-text-primary)', fontSize: '13px' }
                                }, chapter.title),
                                e('div', {
                                  className: 'text-xs mb-2',
                                  style: { color: 'var(--faust-text-tertiary)' }
                                }, `${chapter.wordCount} sanaa`),
                                chapter.tags.length > 0 && e('div', {
                                  className: 'flex flex-wrap gap-1'
                                },
                                  ...chapter.tags.slice(0, 3).map(tag =>
                                    e('span', {
                                      key: tag.tag,
                                      className: 'inline-tag text-xs'
                                    }, tag.text)
                                  )
                                )
                              )
                            )
                          )
                        );
                      })
                    )
                  )
                ),

                // Footer stats
                e('div', {
                  className: 'p-3 border-t flex items-center justify-between',
                  style: { borderColor: 'var(--faust-border)' }
                },
                  e('div', {
                    className: 'text-xs flex gap-4',
                    style: { color: 'var(--faust-text-secondary)' }
                  },
                    e('div', null, `Yhteensä: ${chapters.length} lukua`),
                    e('div', null, `Luonnoksia: ${statusCounts.draft}`),
                    e('div', null, `Tarkistuksessa: ${statusCounts.review}`),
                    e('div', null, `Valmiita: ${statusCounts.done}`)
                  ),
                  e('div', {
                    className: 'text-xs',
                    style: { color: 'var(--faust-text-tertiary)' }
                  }, `Edistyminen: ${Math.round((statusCounts.done / Math.max(chapters.length, 1)) * 100)}%`)
                )
              )
            );
          })(),

          // Find / Replace Modal
          showFindDialog && e('div', {
            className: 'fixed inset-0 bg-black/70 flex items-center justify-center z-50',
            onClick: closeFindDialog
          },
            e('div', {
              className: 'w-full max-w-xl rounded-lg border shadow-2xl p-4 space-y-4',
              style: {
                background: 'var(--faust-dark)',
                borderColor: 'var(--faust-gold)'
              },
              onClick: (ev) => ev.stopPropagation()
            },
              e('div', {
                className: 'flex items-center justify-between'
              },
                e('h3', {
                  className: 'text-lg font-semibold',
                  style: { color: 'var(--faust-gold)' }
                }, findMode === 'replace' ? 'Etsi ja korvaa' : 'Etsi tekstistä'),
                e('button', {
                  className: 'px-3 py-1 text-sm rounded hover:bg-white/10 transition-all',
                  onClick: closeFindDialog
                }, 'Sulje')
              ),
              e('div', null,
                e('label', {
                  className: 'block text-xs uppercase tracking-wide mb-1',
                  style: { color: 'var(--faust-text-secondary)' }
                }, 'Hakusana'),
                e('input', {
                  ref: findInputRef,
                  type: 'text',
                  value: findQuery,
                  onChange: (ev) => setFindQuery(ev.target.value),
                  onKeyDown: (ev) => {
                    if (ev.key === 'Enter') {
                      ev.preventDefault();
                      if (ev.shiftKey) {
                        goToPreviousMatch();
                      } else {
                        goToNextMatch();
                      }
                    }
                  },
                  className: 'w-full p-2 rounded border text-sm',
                  style: {
                    background: 'var(--faust-paper)',
                    color: 'var(--faust-ink)',
                    borderColor: 'var(--faust-border)'
                  },
                  placeholder: 'Kirjoita haettava sana tai lause'
                })
              ),
              e('div', {
                className: 'flex items-center justify-between text-xs',
                style: { color: 'var(--faust-text-secondary)' }
              },
                e('label', { className: 'flex items-center gap-2' },
                  e('input', {
                    type: 'checkbox',
                    checked: findCaseSensitive,
                    onChange: (ev) => setFindCaseSensitive(ev.target.checked)
                  }),
                  'Huomioi kirjainkoko'
                ),
                e('div', null,
                  findMatches.length > 0
                    ? `Osumia: ${currentMatchIndex + 1}/${findMatches.length}`
                    : findQuery
                      ? 'Ei osumia'
                      : ' '
                )
              ),
              findMode === 'replace' && e('div', null,
                e('label', {
                  className: 'block text-xs uppercase tracking-wide mb-1',
                  style: { color: 'var(--faust-text-secondary)' }
                }, 'Korvaa'),
                e('input', {
                  type: 'text',
                  value: findReplaceValue,
                  onChange: (ev) => setFindReplaceValue(ev.target.value),
                  onKeyDown: (ev) => {
                    if (ev.key === 'Enter') {
                      ev.preventDefault();
                      if (ev.shiftKey) {
                        replaceAllMatches();
                      } else {
                        replaceCurrentMatch();
                      }
                    }
                  },
                  className: 'w-full p-2 rounded border text-sm',
                  style: {
                    background: 'var(--faust-paper)',
                    color: 'var(--faust-ink)',
                    borderColor: 'var(--faust-border)'
                  },
                  placeholder: 'Korvaava teksti'
                })
              ),
              e('div', {
                className: 'flex flex-wrap gap-2'
              },
                e('button', {
                  className: 'px-3 py-1 rounded text-sm',
                  onClick: goToPreviousMatch,
                  disabled: findMatches.length === 0,
                  style: {
                    background: 'rgba(154, 123, 79, 0.2)',
                    color: 'var(--faust-text-secondary)',
                    opacity: findMatches.length === 0 ? 0.5 : 1
                  }
                }, 'Edellinen'),
                e('button', {
                  className: 'px-3 py-1 rounded text-sm',
                  onClick: goToNextMatch,
                  disabled: findMatches.length === 0 && !findQuery,
                  style: {
                    background: 'var(--faust-gold)',
                    color: 'var(--faust-dark)',
                    opacity: findMatches.length === 0 && !findQuery ? 0.5 : 1
                  }
                }, 'Seuraava'),
                findMode === 'replace' && e('button', {
                  className: 'px-3 py-1 rounded text-sm',
                  onClick: replaceCurrentMatch,
                  disabled: findMatches.length === 0 || !findQuery,
                  style: {
                    background: 'rgba(154, 123, 79, 0.2)',
                    color: 'var(--faust-text-secondary)',
                    opacity: findMatches.length === 0 || !findQuery ? 0.5 : 1
                  }
                }, 'Korvaa'),
                findMode === 'replace' && e('button', {
                  className: 'px-3 py-1 rounded text-sm',
                  onClick: replaceAllMatches,
                  disabled: findMatches.length === 0 || !findQuery,
                  style: {
                    background: 'rgba(154, 123, 79, 0.4)',
                    color: 'var(--faust-dark)',
                    opacity: findMatches.length === 0 || !findQuery ? 0.5 : 1
                  }
                }, 'Korvaa kaikki')
              )
            )
          ),

          // Natural Language Search Modal
          showSearchModal && e('div', {
            className: 'fixed inset-0 bg-black/80 flex items-center justify-center z-50',
            onClick: () => setShowSearchModal(false)
          },
            e('div', {
              className: 'w-full max-w-4xl rounded-lg border shadow-2xl p-5 space-y-4',
              style: {
                background: 'var(--faust-dark)',
                borderColor: 'var(--faust-gold)',
                maxHeight: '85vh',
                overflowY: 'auto'
              },
              onClick: (ev) => ev.stopPropagation()
            },
              e('div', {
                className: 'flex items-center justify-between'
              },
                e('h3', {
                  className: 'text-lg font-semibold',
                  style: { color: 'var(--faust-gold)' }
                }, '🔍 Luonnollinen haku'),
                e('button', {
                  className: 'px-3 py-1 text-sm rounded hover:bg-white/10 transition-all',
                  onClick: () => setShowSearchModal(false)
                }, 'Sulje')
              ),
              e('div', { className: 'flex gap-3 items-center flex-wrap' },
                e('input', {
                  type: 'text',
                  value: naturalQuery,
                  onChange: (ev) => setNaturalQuery(ev.target.value),
                  onKeyDown: (ev) => {
                    if (ev.key === 'Enter') {
                      const results = executeNaturalSearch(naturalQuery);
                      setSearchResults(results);
                    }
                  },
                  className: 'flex-1 min-w-[220px] p-2 rounded border text-sm',
                  style: {
                    background: 'var(--faust-paper)',
                    color: 'var(--faust-ink)',
                    borderColor: 'var(--faust-border)'
                  },
                  placeholder: 'Esim: "näytä kaikki kohtaukset joissa Anna"'
                }),
                e('button', {
                  className: 'px-4 py-2 rounded text-sm font-medium',
                  style: {
                    background: 'var(--faust-gold)',
                    color: 'var(--faust-dark)'
                  },
                  onClick: () => {
                    const results = executeNaturalSearch(naturalQuery);
                    setSearchResults(results);
                  }
                }, 'Hae')
              ),
              e('div', {
                className: 'text-xs',
                style: { color: 'var(--faust-text-secondary)' }
              }, searchResults.length > 0
                ? `Osumia: ${searchResults.length}`
                : 'Kirjoita haku ja paina Enter tai Hae'),
              e('div', {
                className: 'space-y-3'
              },
                searchResults.length > 0
                  ? searchResults.map(result =>
                      e('div', {
                        key: result.item.id,
                        className: 'p-3 rounded border cursor-pointer transition-all',
                        style: {
                          background: 'var(--faust-shadow)',
                          borderColor: 'var(--faust-border)'
                        },
                        onClick: () => {
                          setActiveItemId(result.item.id);
                          setShowSearchModal(false);
                        },
                        onMouseEnter: (ev) => {
                          ev.currentTarget.style.borderColor = 'var(--faust-gold)';
                        },
                        onMouseLeave: (ev) => {
                          ev.currentTarget.style.borderColor = 'var(--faust-border)';
                        }
                      },
                        e('div', {
                          className: 'text-sm font-medium mb-1',
                          style: { color: 'var(--faust-text-primary)' }
                        }, result.item.title || 'Nimetön dokumentti'),
                        e('div', {
                          className: 'text-xs mb-2',
                          style: { color: 'var(--faust-text-secondary)' }
                        }, result.reasons?.join(' • ') || 'Hakutulos'),
                        e('div', {
                          className: 'text-xs italic',
                          style: { color: 'var(--faust-text-tertiary)' }
                        }, result.preview || '')
                      )
                    )
                  : [
                      e('p', {
                        key: 'no-results',
                        className: 'text-sm',
                        style: { color: 'var(--faust-text-secondary)' }
                      }, 'Ei hakutuloksia vielä.')
                    ])
              )
            )
          ),

          // Spellcheck Modal
          spellcheckModalOpen && e('div', {
            className: 'fixed inset-0 bg-black/70 flex items-center justify-center z-50',
            onClick: () => setSpellcheckModalOpen(false)
          },
            e('div', {
              className: 'w-full max-w-3xl rounded-lg border shadow-2xl p-5 space-y-4',
              style: {
                background: 'var(--faust-dark)',
                borderColor: 'var(--faust-gold)',
                maxHeight: '80vh',
                overflowY: 'auto'
              },
              onClick: (ev) => ev.stopPropagation()
            },
              e('div', {
                className: 'flex items-center justify-between'
              },
                e('h3', {
                  className: 'text-lg font-semibold',
                  style: { color: 'var(--faust-gold)' }
                }, 'Oikeinkirjoituksen tarkistus'),
                e('button', {
                  className: 'px-3 py-1 text-sm rounded hover:bg-white/10 transition-all',
                  onClick: () => setSpellcheckModalOpen(false)
                }, 'Sulje')
              ),
              dictionaryStatus === 'error'
                ? e('p', {
                    className: 'text-sm',
                    style: { color: 'var(--faust-text-secondary)' }
                  }, 'Sanakirja ei ole käytettävissä. Tarkista, että utils/dictionaries/fi-basic.json on mukana asennuksessa.')
                : spellcheckLoading
                  ? e('p', {
                      className: 'text-sm',
                      style: { color: 'var(--faust-text-secondary)' }
                    }, 'Tarkistetaan oikeinkirjoitusta...')
                  : spellcheckResults.length === 0
                    ? e('p', {
                        className: 'text-sm',
                        style: { color: 'var(--faust-text-secondary)' }
                      }, 'Ei kirjoitusvirheitä tässä dokumentissa.')
                    : e('div', {
                        className: 'space-y-3'
                      },
                        ...spellcheckResults.map(result =>
                          e('div', {
                            key: result.word,
                            className: 'p-3 rounded border',
                            style: {
                              background: 'var(--faust-shadow)',
                              borderColor: 'var(--faust-border)'
                            }
                          },
                            e('div', {
                              className: 'flex items-center justify-between mb-2'
                            },
                              e('div', {
                                className: 'text-sm font-medium',
                                style: { color: 'var(--faust-gold)' }
                              }, result.word),
                              e('div', {
                                className: 'text-xs',
                                style: { color: 'var(--faust-text-secondary)' }
                              }, `Esiintymät: ${result.count}`)
                            ),
                            result.suggestions.length > 0
                              ? e('div', {
                                  className: 'flex flex-wrap gap-2'
                                },
                                  ...result.suggestions.map(suggestion =>
                                    e('button', {
                                      key: suggestion,
                                      className: 'px-3 py-1 text-xs rounded',
                                      onClick: () => replaceMisspelling(result.word, suggestion),
                                      style: {
                                        background: 'rgba(154, 123, 79, 0.3)',
                                        color: 'var(--faust-dark)'
                                      }
                                    }, `Korvaa "${suggestion}"`)
                                  )
                                )
                              : e('div', {
                                  className: 'text-xs italic',
                                  style: { color: 'var(--faust-text-secondary)' }
                                }, 'Ei ehdotuksia – korjaa manuaalisesti')
                          )
                        )
                      )
            )
          ),
          // Graph View Modal
          showGraphView && (() => {
            const graphData = buildGraphData();
            const { nodes, links } = graphData;
            
            // Filter nodes based on mode
            const filteredNodes = graphViewMode === 'all' 
              ? nodes 
              : nodes.filter(n => n.type === graphViewMode.replace('s', ''));
            
            // Simple force-directed layout (manual positioning)
            const centerX = 400;
            const centerY = 300;
            const radius = 150;
            
            const positionedNodes = filteredNodes.map((node, idx) => {
              const angle = (idx / filteredNodes.length) * 2 * Math.PI;
              return {
                ...node,
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle)
              };
            });

            return e('div', {
              className: 'fixed inset-0 bg-black/80 flex items-center justify-center z-50',
              onClick: () => setShowGraphView(false)
            },
              e('div', {
                className: 'rounded-lg border shadow-2xl',
                style: {
                  background: 'var(--faust-dark)',
                  borderColor: 'var(--faust-gold)',
                  width: '90vw',
                  height: '90vh',
                  maxWidth: '1400px',
                  display: 'flex',
                  flexDirection: 'column'
                },
                onClick: (e) => e.stopPropagation()
              },
                // Header
                e('div', {
                  className: 'p-4 border-b flex items-center justify-between',
                  style: { borderColor: 'var(--faust-border)' }
                },
                  e('div', {
                    className: 'flex items-center gap-3'
                  },
                    e('h3', {
                      className: 'text-lg font-semibold',
                      style: { color: 'var(--faust-gold)' }
                    }, '🜍 Verkkonäkymä - Entiteettien suhteet'),
                    e('div', {
                      className: 'flex gap-2'
                    },
                      ['all', 'characters', 'locations'].map(mode =>
                        e('button', {
                          key: mode,
                          onClick: () => setGraphViewMode(mode),
                          className: 'px-3 py-1 rounded text-xs font-medium transition-all',
                          style: {
                            background: graphViewMode === mode 
                              ? 'var(--faust-gold)' 
                              : 'rgba(154, 123, 79, 0.2)',
                            color: graphViewMode === mode 
                              ? 'var(--faust-dark)' 
                              : 'var(--faust-text-secondary)'
                          }
                        }, 
                          mode === 'all' ? 'Kaikki' : 
                          mode === 'characters' ? 'Hahmot' : 'Paikat'
                        )
                      )
                    )
                  ),
                  e('button', {
                    onClick: () => setShowGraphView(false),
                    className: 'px-4 py-2 rounded hover:bg-white/10 transition-all',
                    style: { color: 'var(--faust-text-secondary)' }
                  }, '✕ Sulje')
                ),

                // Graph Canvas
                e('div', {
                  className: 'flex-1 overflow-hidden relative',
                  style: { background: 'var(--faust-bg-primary)' }
                },
                  // SVG for graph
                  e('svg', {
                    width: '100%',
                    height: '100%',
                    viewBox: '0 0 800 600'
                  },
                    // Draw links
                    e('g', { id: 'links' },
                      ...links
                        .filter(link => 
                          positionedNodes.find(n => n.id === link.source) &&
                          positionedNodes.find(n => n.id === link.target)
                        )
                        .map((link, idx) => {
                          const sourceNode = positionedNodes.find(n => n.id === link.source);
                          const targetNode = positionedNodes.find(n => n.id === link.target);
                          if (!sourceNode || !targetNode) return null;
                          
                          return e('line', {
                            key: `link-${idx}`,
                            x1: sourceNode.x,
                            y1: sourceNode.y,
                            x2: targetNode.x,
                            y2: targetNode.y,
                            stroke: 'var(--faust-bronze)',
                            strokeWidth: 2,
                            strokeOpacity: 0.3
                          });
                        })
                    ),

                    // Draw nodes
                    e('g', { id: 'nodes' },
                      ...positionedNodes.map(node =>
                        e('g', {
                          key: node.id,
                          transform: `translate(${node.x}, ${node.y})`,
                          style: { cursor: 'pointer' },
                          onClick: () => {
                            if (node.type === 'character') {
                              setInspectorTab('characters');
                              setShowGraphView(false);
                            } else if (node.type === 'location') {
                              setInspectorTab('locations');
                              setShowGraphView(false);
                            }
                          }
                        },
                          // Node circle
                          e('circle', {
                            r: 30,
                            fill: node.type === 'character' 
                              ? 'rgba(100, 200, 255, 0.3)' 
                              : 'rgba(255, 200, 100, 0.3)',
                            stroke: node.type === 'character'
                              ? 'var(--faust-gold)'
                              : 'var(--faust-brass)',
                            strokeWidth: 2,
                            onMouseEnter: (e) => {
                              e.target.setAttribute('r', 35);
                              e.target.setAttribute('stroke-width', 3);
                            },
                            onMouseLeave: (e) => {
                              e.target.setAttribute('r', 30);
                              e.target.setAttribute('stroke-width', 2);
                            }
                          }),
                          
                          // Node icon
                          e('text', {
                            textAnchor: 'middle',
                            dy: 6,
                            fontSize: 20,
                            fill: 'var(--faust-text-primary)',
                            style: { pointerEvents: 'none' }
                          }, node.type === 'character' ? '👤' : '📍'),

                          // Node label
                          e('text', {
                            textAnchor: 'middle',
                            dy: 50,
                            fontSize: 12,
                            fill: 'var(--faust-text-primary)',
                            fontWeight: 500,
                            style: { pointerEvents: 'none' }
                          }, node.name)
                        )
                      )
                    )
                  ),

                  // Stats overlay
                  e('div', {
                    className: 'absolute top-4 left-4 p-3 rounded-lg',
                    style: {
                      background: 'rgba(0, 0, 0, 0.7)',
                      color: 'var(--faust-text-primary)',
                      backdropFilter: 'blur(10px)'
                    }
                  },
                    e('div', { className: 'text-xs font-semibold mb-2' }, 'Tilastot:'),
                    e('div', { className: 'text-xs space-y-1' },
                      e('div', null, `• Solmuja: ${positionedNodes.length}`),
                      e('div', null, `• Yhteyksiä: ${links.length}`),
                      e('div', null, `• Hahmoja: ${nodes.filter(n => n.type === 'character').length}`),
                      e('div', null, `• Paikkoja: ${nodes.filter(n => n.type === 'location').length}`)
                    )
                  )
                )
              )
            );
          })(),
          inspectorTab === 'grimoire' && e('div', { className: 'space-y-4' },
            e('h4', {
              className: 'text-sm font-semibold mb-3 flex items-center gap-2',
              style: { color: 'var(--faust-text-primary)' }
            },
              e('span', null, '📖'),
              'Grimoire - Projektimuisti'
            ),

            // Hyväksytyt muutokset
            e('div', {
              className: 'p-3 rounded border',
              style: {
                background: 'var(--faust-shadow)',
                borderColor: 'var(--faust-border)'
              }
            },
              e('div', {
                className: 'font-medium mb-2 flex items-center gap-2',
                style: { color: 'var(--faust-gold)' }
              },
                e('span', null, '✓'),
                'Hyväksytyt muutokset'
              ),
              e('div', {
                className: 'text-xs',
                style: { color: 'var(--faust-text-tertiary)' }
              }, `${project.grimoire?.acceptedChanges?.length || 0} hyväksyttyä muutosta`),
              (project.grimoire?.acceptedChanges || []).length > 0 && e('div', { className: 'mt-2 space-y-2' },
                project.grimoire.acceptedChanges.slice(-3).reverse().map(change =>
                  e('div', {
                    key: change.timestamp,
                    className: 'p-2 rounded text-xs',
                    style: {
                      background: 'rgba(154, 205, 50, 0.1)',
                      borderLeft: '2px solid rgba(154, 205, 50, 0.5)'
                    }
                  },
                    e('div', {
                      className: 'font-medium mb-1',
                      style: { color: 'var(--faust-text-primary)' }
                    }, change.explanation || 'Muutos'),
                    e('div', {
                      style: { color: 'var(--faust-text-tertiary)' }
                    }, new Date(change.timestamp).toLocaleString('fi-FI'))
                  )
                ))
              )
            ),

            // Hylätyt ehdotukset
            e('div', {
              className: 'p-3 rounded border',
              style: {
                background: 'var(--faust-shadow)',
                borderColor: 'var(--faust-border)'
              }
            },
              e('div', {
                className: 'font-medium mb-2 flex items-center gap-2',
                style: { color: 'rgba(255, 99, 71, 0.8)' }
              },
                e('span', null, '✗'),
                'Hylätyt ehdotukset'
              ),
              e('div', {
                className: 'text-xs',
                style: { color: 'var(--faust-text-tertiary)' }
              }, `${project.grimoire?.rejectedSuggestions?.length || 0} hylättyä ehdotusta`),
              (project.grimoire?.rejectedSuggestions || []).length > 0 && e('div', { className: 'mt-2 space-y-2' },
                project.grimoire.rejectedSuggestions.slice(-3).reverse().map(rejection =>
                  e('div', {
                    key: rejection.timestamp,
                    className: 'p-2 rounded text-xs',
                    style: {
                      background: 'rgba(255, 99, 71, 0.1)',
                      borderLeft: '2px solid rgba(255, 99, 71, 0.5)'
                    }
                  },
                    e('div', {
                      className: 'font-medium mb-1',
                      style: { color: 'var(--faust-text-primary)' }
                    }, rejection.explanation || 'Ehdotus'),
                    e('div', {
                      style: { color: 'var(--faust-text-secondary)' }
                    }, new Date(rejection.timestamp).toLocaleString('fi-FI'))
                  )
                ))
              )
            ),

            // Tyylisäännöt
            e('div', {
              className: 'p-3 rounded border',
              style: {
                background: 'var(--faust-shadow)',
                borderColor: 'var(--faust-border)'
              }
            },
              e('div', {
                className: 'font-medium mb-2 flex items-center justify-between',
                style: { color: 'var(--faust-text-primary)' }
              },
                e('span', null, 'Tyylisääntöjä'),
                e('button', {
                  onClick: () => {
                    const rule = prompt('Lisää tyylisääntö:');
                    if (rule) {
                      setProject({
                        ...project,
                        grimoire: {
                          ...project.grimoire,
                          styleRules: [...(project.grimoire?.styleRules || []), {
                            rule,
                            timestamp: Date.now()
                          }]
                        }
                      });
                    }
                  },
                  className: 'px-2 py-1 rounded text-xs',
                  style: {
                    background: 'var(--faust-bronze)',
                    color: '#141210'
                  }
                }, '+ Lisää')
              ),
              e('div', {
                className: 'text-xs',
                style: { color: 'var(--faust-text-tertiary)' }
              }, `${project.grimoire?.styleRules?.length || 0} sääntöä`),
              (project.grimoire?.styleRules || []).length > 0 && e('ul', { className: 'mt-2 space-y-1' },
                project.grimoire.styleRules.map((rule, idx) =>
                  e('li', {
                    key: idx,
                    className: 'text-xs flex items-start gap-2',
                    style: { color: 'var(--faust-text-secondary)' }
                  },
                    e('span', null, '•'),
                    e('span', null, rule.rule)
                  )
                )
              )
            ),

            // Keskusteluhistoria
            e('div', {
              className: 'p-3 rounded border',
              style: {
                background: 'var(--faust-shadow)',
                borderColor: 'var(--faust-border)'
              }
            },
              e('div', {
                className: 'font-medium mb-2',
                style: { color: 'var(--faust-text-primary)' }
              }, 'Keskusteluhistoria'),
              e('div', {
                className: 'text-xs',
                style: { color: 'var(--faust-text-tertiary)' }
              }, `${project.grimoire?.conversations?.length || 0} keskustelua AI:n kanssa`)
            )
          ),
          inspectorTab === 'agents' && e('div', { className: 'space-y-4' },
            e('h4', {
              className: 'text-sm font-semibold mb-3 flex items-center gap-2',
              style: { color: 'var(--faust-text-primary)' }
            },
              e('span', null, '🜍'),
              'AI-Agentit'
            ),

            // Automaattinen jatkuvuusvalvonta
            e('div', {
              className: 'p-3 rounded border',
              style: {
                background: 'var(--faust-shadow)',
                borderColor: 'var(--faust-border)'
              }
            },
              e('div', { className: 'flex items-center justify-between mb-2' },
                e('div', {
                  className: 'font-medium',
                  style: { color: 'var(--faust-text-primary)' }
                }, 'Automaattinen valvonta'),
                e('label', { className: 'flex items-center gap-2 cursor-pointer' },
                  e('input', {
                    type: 'checkbox',
                    checked: autoCheckEnabled,
                    onChange: (e) => setAutoCheckEnabled(e.target.checked),
                    className: 'w-4 h-4 rounded',
                    style: { accentColor: 'var(--faust-gold)' }
                  }),
                  e('span', {
                    className: 'text-xs',
                    style: { color: 'var(--faust-text-secondary)' }
                  }, autoCheckEnabled ? 'Päällä' : 'Pois')
                )
              ),
              e('div', {
                className: 'text-xs',
                style: { color: 'var(--faust-text-tertiary)' }
              }, 'Tarkistaa hahmojen ja juonen jatkuvuutta automaattisesti 10 sekunnin kirjoitustauon jälkeen.')
            ),

            // CharacterKeeper
            e('div', {
              className: 'p-3 rounded border',
              style: {
                background: 'var(--faust-shadow)',
                borderColor: 'var(--faust-border)'
              }
            },
              e('div', { className: 'flex items-center gap-2 mb-2' },
                e('span', null, '👤'),
                e('div', {
                  className: 'font-medium',
                  style: { color: 'var(--faust-text-primary)' }
                }, 'CharacterKeeper')
              ),
              e('div', {
                className: 'text-xs mb-2',
                style: { color: 'var(--faust-text-secondary)' }
              }, 'Valvoo hahmojen psykologista jatkuvuutta, resursseja, loukkaantumisia ja ääntä.'),
              e('button', {
                onClick: async () => {
                  const activeItem = getActiveItem();
                  if (!activeItem || !activeItem?.content) {
                    alert('Valitse ensin luku jossa on tekstiä!');
                    return;
                  }
                  
                  const content = activeItem.content;
                  const mentionedCharacters = project.characters.filter(char =>
                    content.toLowerCase().includes(char.name.toLowerCase())
                  );
                  
                  if (mentionedCharacters.length === 0) {
                    alert('Ei hahmojen mainintoja tässä luvussa!');
                    return;
                  }
                  
                  setIsGenerating(true);
                  const warnings = [];
                  
                  for (const char of mentionedCharacters) {
                    const analysis = await runCharacterKeeper(content, char);
                    if (analysis && analysis.issues && analysis.issues.length > 0) {
                      warnings.push({
                        agent: 'CharacterKeeper',
                        character: char.name,
                        issues: analysis.issues,
                        timestamp: Date.now()
                      });
                    }
                  }
                  
                  setContinuityWarnings(warnings);
                  setIsGenerating(false);
                  
                  if (warnings.length === 0) {
                    alert('✓ Ei jatkuvuusongelmia löydetty!');
                  }
                },
                disabled: isGenerating,
                className: 'w-full px-3 py-2 rounded text-xs font-medium transition-all',
                style: {
                  background: isGenerating ? 'var(--faust-text-tertiary)' : 'var(--faust-gold)',
                  color: '#141210',
                  cursor: isGenerating ? 'wait' : 'pointer'
                }
              }, isGenerating ? 'Tarkistetaan...' : 'Tarkista nyt')
            ),

            // StoryKeeper
            e('div', {
              className: 'p-3 rounded border',
              style: {
                background: 'var(--faust-shadow)',
                borderColor: 'var(--faust-border)'
              }
            },
              e('div', { className: 'flex items-center gap-2 mb-2' },
                e('span', null, '📖'),
                e('div', {
                  className: 'font-medium',
                  style: { color: 'var(--faust-text-primary)' }
                }, 'StoryKeeper')
              ),
              e('div', {
                className: 'text-xs mb-2',
                style: { color: 'var(--faust-text-secondary)' }
              }, 'Tarkistaa juonen loogisen eheyden ja juonilankojen konsistenssin.'),
              e('button', {
                onClick: checkStoryLogic,
                disabled: isGenerating,
                className: 'w-full px-3 py-2 rounded text-xs font-medium transition-all',
                style: {
                  background: isGenerating ? 'var(--faust-text-tertiary)' : 'var(--faust-brass)',
                  color: '#141210',
                  cursor: isGenerating ? 'wait' : 'pointer'
                }
              }, isGenerating ? 'Analysoidaan...' : 'Analysoi tarina')
            ),

            // Varoitukset
            continuityWarnings.length > 0 && e('div', {
              className: 'p-3 rounded border',
              style: {
                background: 'rgba(255, 159, 64, 0.1)',
                borderColor: 'rgba(255, 159, 64, 0.3)'
              }
            },
              e('div', {
                className: 'font-medium mb-2',
                style: { color: '#FF9F40' }
              }, `⚠️ ${continuityWarnings.length} varoitus(ta)`),
              ...continuityWarnings.slice(0, 3).flatMap(warning =>
                warning.issues.slice(0, 2).map((issue, idx) =>
                  e('div', {
                    key: `${warning.character}-${idx}`,
                    className: 'mb-2 text-xs'
                  },
                    e('div', {
                      className: 'font-medium',
                      style: { color: 'var(--faust-text-primary)' }
                    }, `${warning.character}: ${issue.type}`),
                    e('div', {
                      style: { color: 'var(--faust-text-secondary)' }
                    }, issue.problem)
                  )
                )
              ),
              continuityWarnings.length > 3 && e('div', {
                className: 'text-xs italic mt-2',
                style: { color: 'var(--faust-text-tertiary)' }
              }, `... ja ${continuityWarnings.length - 3} muuta`)
            )
          ),

          inspectorTab === 'appearance' && e('div', { className: 'space-y-4' },
            e('h4', { className: 'text-sm font-semibold mb-3' }, 'Ulkoasu'),

            // Fontti valinta
            e('div', { className: 'space-y-2' },
              e('label', { className: 'text-xs font-medium opacity-75' }, 'Fontti'),
              e('select', {
                value: editorFont,
                onChange: (ev) => setEditorFont(ev.target.value),
                className: `w-full p-2 rounded border text-sm ${
                  isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
                }`
              }, fontOptions.map(font =>
                e('option', { key: font.id, value: font.id }, font.name)
              ))
            ),

            // Fonttikoko
            e('div', { className: 'space-y-2' },
              e('label', { className: 'text-xs font-medium opacity-75' }, `Fonttikoko: ${fontSize}px`),
              e('input', {
                type: 'range',
                min: 12,
                max: 32,
                value: fontSize,
                onChange: (ev) => setFontSize(parseInt(ev.target.value)),
                className: 'w-full'
              }),
              e('div', { className: 'flex justify-between text-xs opacity-50' },
                e('span', null, '12px'),
                e('span', null, '32px')
              )
            ),

            // Riviväli
            e('div', { className: 'space-y-2' },
              e('label', { className: 'text-xs font-medium opacity-75' }, `Riviväli: ${lineHeight}`),
              e('input', {
                type: 'range',
                min: 1,
                max: 3,
                step: 0.1,
                value: lineHeight,
                onChange: (ev) => setLineHeight(parseFloat(ev.target.value)),
                className: 'w-full'
              }),
              e('div', { className: 'flex justify-between text-xs opacity-50' },
                e('span', null, 'Tiukka'),
                e('span', null, 'Väljä')
              )
            ),

            // Esikatselu
            e('div', {
              className: `p-4 rounded border ${
                isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'
              }`
            },
              e('h5', { className: 'text-xs font-medium mb-2 opacity-75' }, 'Esikatselu'),
              e('p', {
                style: {
                  fontFamily: fontOptions.find(f => f.id === editorFont)?.family,
                  fontSize: `${fontSize}px`,
                  lineHeight: lineHeight
                }
              }, 'Tämä on esimerkkiteksti. Näet miltä valitsemasi fontti näyttää kirjoittaessa. Lorem ipsum dolor sit amet, consectetur adipiscing elit.')
            ),

            // Kirjoitustila vaihtoehdot
            e('div', { className: 'space-y-2 pt-4 border-t ' + (isDarkMode ? 'border-gray-700' : 'border-gray-200') },
              e('h5', { className: 'text-xs font-medium mb-2 opacity-75' }, 'Kirjoitustila'),

              e('label', { className: 'flex items-center gap-2 text-sm' },
                e('input', {
                  type: 'checkbox',
                  checked: typewriterMode || false,
                  onChange: (ev) => setTypewriterMode(ev.target.checked)
                }),
                'Typewriter scrolling'
              ),

              e('label', { className: 'flex items-center gap-2 text-sm' },
                e('input', {
                  type: 'checkbox',
                  checked: focusMode || false,
                  onChange: (ev) => setFocusMode(ev.target.checked)
                }),
                'Focus mode (korostaa nykyistä kappaletta)'
              ),

              e('label', { className: 'flex items-center gap-2 text-sm' },
                e('input', {
                  type: 'checkbox',
                  checked: showWordCount || true,
                  onChange: (ev) => setShowWordCount(ev.target.checked)
                }),
                'Näytä sanamäärä'
              )
            )
          ),
          // HAHMOT-välilehti - CharacterKeeper
          inspectorTab === 'characters' && e('div', { className: 'space-y-3' },
            e('div', { className: 'flex items-center justify-between mb-3' },
              e('h4', { className: 'text-sm font-semibold flex items-center gap-2' },
                e('span', null, '👥 Hahmot'),
                e('span', { className: 'text-xs opacity-50 font-normal' },
                  `${project.characters?.length || 0} hahmoa`)
              ),
              e('button', {
                onClick: () => {
                  const newChar = {
                    ...CHARACTER_TEMPLATE,
                    id: Date.now(),
                    name: 'Uusi hahmo'
                  };
                  setProject({
                    ...project,
                    characters: [...(project.characters || []), newChar]
                  });
                },
                className: 'px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600'
              }, '+ Lisää hahmo')
            ),
            
            // Auto-check toggle
            e('label', { 
              className: 'flex items-center gap-2 text-xs p-2 rounded',
              style: {
                background: isDarkMode ? '#374151' : '#F3F4F6',
                cursor: 'pointer'
              }
            },
              e('input', {
                type: 'checkbox',
                checked: autoCheckEnabled,
                onChange: (ev) => setAutoCheckEnabled(ev.target.checked),
                className: 'rounded'
              }),
              e('span', { className: autoCheckEnabled ? 'font-semibold' : '' },
                '⚙️ Automaattinen valvonta'
              ),
              e('span', { className: 'text-[10px] opacity-60' },
                '(tarkistaa 3s jälkeen)'
              )
            ),

            // Hahmolista
            (project.characters || []).length === 0 ?
              e('div', { className: 'text-xs opacity-50 text-center py-8' },
                'Ei hahmoja. Luo ensimmäinen hahmo!') :

              (project.characters || []).map(char =>
                e('div', {
                  key: char.id,
                  className: `p-3 rounded border mb-2 ${
                    isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'
                  }`
                },
                  // Hahmon nimi
                  e('div', { className: 'flex items-center justify-between mb-2' },
                    e('input', {
                      value: char.name,
                      onChange: (ev) => {
                        setProject({
                          ...project,
                          characters: project.characters.map(c =>
                            c.id === char.id ? { ...c, name: ev.target.value } : c
                          )
                        });
                      },
                      className: `font-medium text-sm bg-transparent border-b border-transparent hover:border-blue-500 focus:border-blue-500 outline-none ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`,
                      placeholder: 'Hahmon nimi'
                    }),
                    e('button', {
                      onClick: () => {
                        if (confirm(`Poista hahmo "${char.name}"?`)) {
                          setProject({
                            ...project,
                            characters: project.characters.filter(c => c.id !== char.id)
                          });
                        }
                      },
                      className: 'text-red-500 hover:text-red-600'
                    }, e(Icons.Trash))
                  ),

                  // Pika-info
                  e('div', { className: 'text-xs space-y-1 opacity-75 mb-2' },
                    char.bio.age && e('div', null, `📅 ${char.bio.age} vuotta`),
                    char.bio.occupation && e('div', null, `💼 ${char.bio.occupation}`),
                    char.psychology.want && e('div', null, `🎯 Haluaa: ${char.psychology.want}`)
                  ),

                  // Toimintopainikkeet
                  e('div', { className: 'flex gap-1 mt-2' },
                    e('button', {
                      onClick: () => {
                        // Avaa CharacterSheet -modaali
                        setEditingCharacter(char);
                        setShowCharacterSheet(true);
                      },
                      className: 'flex-1 px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600'
                    }, '✏️ Muokkaa'),

                    e('button', {
                      onClick: () => {
                        // Tarkista hahmo nykyisessä dokumentissa
                        checkCharacterContinuity(char);
                      },
                      className: 'flex-1 px-2 py-1 text-xs rounded bg-purple-500 text-white hover:bg-purple-600',
                      title: 'Tarkista jatkuvuus'
                    }, '🔍 Tarkista')
                  ),

                  // Backlinks - Näytä missä hahmoa mainittu
                  (() => {
                    const backlinks = getBacklinks(char.name);
                    if (backlinks.length === 0) return null;

                    return e('div', {
                      className: 'mt-2 p-2 rounded text-xs',
                      style: {
                        background: 'rgba(100, 200, 255, 0.1)',
                        borderLeft: '2px solid rgba(100, 200, 255, 0.5)'
                      }
                    },
                      e('div', {
                        className: 'font-medium mb-1',
                        style: { color: 'var(--faust-text-primary)' }
                      }, `🔗 Mainittu ${backlinks.length} dokumentissa`),
                      e('div', { className: 'space-y-1' },
                        ...backlinks.slice(0, 3).map(backlink =>
                          e('div', {
                            key: backlink.item.id,
                            className: 'cursor-pointer hover:opacity-80',
                            style: { color: 'var(--faust-text-secondary)' },
                            onClick: () => {
                              setActiveItemId(backlink.item.id);
                            }
                          }, `• ${backlink.item.title} (${backlink.count}×)`)
                        ),
                        backlinks.length > 3 && e('div', {
                          style: { color: 'var(--faust-text-tertiary)' }
                        }, `... ja ${backlinks.length - 3} muuta`)
                      )
                    );
                  })()
                )
              )
          ),
          
          // TEKNIIKAT-välilehti
          inspectorTab === 'tekniikat' && e('div', { className: 'space-y-3' },
            // Info-laatikko
            e('div', { className: `p-3 rounded border text-xs mb-4 ${isDarkMode ? 'bg-purple-900/20 border-purple-700' : 'bg-purple-50 border-purple-300'}` },
              e('div', { className: 'font-medium mb-1' }, '💡 Kuinka käyttää:'),
              e('div', { className: 'opacity-75' }, 'Valitse tekniikka → Claude analysoi aktiivisen dokumentin ja soveltaa valitsemaasi tekniikkaa. Tulos ilmestyy AI-avustajaan.')
            ),
            
            // Tekniikkakategoriat
            Object.entries(WRITING_TECHNIQUES).map(([categoryKey, category]) =>
              e('div', { key: categoryKey, className: `p-3 rounded border mb-3 ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}` },
                e('h5', { className: 'text-xs font-bold mb-2 text-' + category.color + '-500' }, category.title),
                
                category.techniques.map(technique =>
                  e('button', {
                    key: technique.id,
                    onClick: () => {
                      // Käytä tekniikkaa nykyiseen sisältöön
                      const activeItem = getActiveItem();
                      const prompt = technique.prompt
                        .replace(/\{\{CONTENT\}\}/g, activeItem?.content?.substring(0,100) || '')
                        .replace('{characterList}', project.characters?.map(char => `
- ${char.name} (${char.bio.age || '?'}v, ${char.bio.occupation || 'ammatti?'})
  Tavoite: ${char.psychology.want || '?'}
  Pelko: ${char.psychology.fear || '?'}
  Puhetyyli: ${char.voice.description || '?'}
`).join('\n') || 'Ei hahmoja määriteltynä')
                        .replace('{selectedCharacter}', editingCharacter ? `${editingCharacter.name} (${editingCharacter.bio.age || '?'}v)` : 'Ei valittua hahmoa')
                        .replace('{voiceDescription}', editingCharacter?.voice?.description || 'Ei määritelty')
                        .replace('{lexicon}', editingCharacter?.voice?.lexicon?.join(', ') || 'Ei määritelty')
                        .replace('{avgSentenceLength}', editingCharacter?.voice?.avgSentenceLength || '12')
                        .replace('{want}', editingCharacter?.psychology?.want || 'Ei määritelty')
                        .replace('{fear}', editingCharacter?.psychology?.fear || 'Ei määritelty')
                        .replace('{weakness}', editingCharacter?.psychology?.weakness || 'Ei määritelty')
                        .replace('{values}', editingCharacter?.psychology?.values?.join(', ') || 'Ei määritelty')
                        .replace('{resources}', editingCharacter?.state?.resources?.join(', ') || 'Ei määritelty')
                        .replace('{injuries}', editingCharacter?.state?.injuries?.join(', ') || 'Ei määritelty')
                        .replace('{appearance}', editingCharacter?.bio?.appearance || 'Ei määritelty')
                        .replace('{beliefs}', JSON.stringify(editingCharacter?.state?.beliefs || {}));

                      if (!aiAssistantOpen) setAiAssistantOpen(true);
                      setAiPrompt(`${technique.name}: ${technique.description}`);
                      callAIAPI(prompt, false);
                    },
                    className: `w-full text-left p-2 mb-2 rounded text-xs transition-colors ${
                      isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-100'
                    }`,
                    title: technique.description
                  },
                    e('div', { className: 'font-medium mb-0.5' }, technique.name),
                    e('div', { className: 'opacity-75 text-[10px]' }, technique.description)
                  )
                )
              )
            )
          ),
          
          // PAIKAT-välilehti (LocationKeeper)
          inspectorTab === 'locations' && e('div', { className: 'space-y-3' },
            // Header
            e('div', { className: 'flex items-center justify-between mb-3' },
              e('h4', { className: 'text-sm font-semibold' }, 
                `📍 Paikat (${project.locations?.length || 0})`),
              e('div', { className: 'flex gap-2' },
                e('button', {
                  onClick: () => {
                    const newLoc = {
                      id: Date.now(),
                      name: 'Uusi paikka',
                      type: 'kaupunki',
                      description: '',
                      facts: {},
                      visual: {}
                    };
                    setProject({ ...project, locations: [...(project.locations || []), newLoc] });
                  },
                  className: 'px-3 py-1 text-xs rounded transition-all',
                  style: {
                    background: 'var(--faust-gold)',
                    color: '#141210',
                    fontWeight: '500'
                  },
                  title: 'Lisää uusi paikka'
                }, '+ Lisää'),
                e('button', {
                  onClick: () => detectLocationsInText(),
                  className: 'px-2 py-1 text-xs rounded bg-purple-500 text-white hover:bg-purple-600',
                  title: 'Tunnista paikat automaattisesti',
                  disabled: isGenerating
                }, '🔍 Tunnista')
              )
            ),

            // Genre-valinta
            e('div', { className: 'mb-3' },
              e('label', { className: 'text-xs block mb-1 opacity-75' }, 'Kirjan genre'),
              e('select', {
                value: project.genre || 'psychological_thriller',
                onChange: (ev) => setProject({ ...project, genre: ev.target.value }),
                className: `w-full p-2 rounded border text-sm ${
                  isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
                }`
              }, GENRE_OPTIONS.map(g => e('option', { key: g.id, value: g.id }, `${g.icon} ${g.name}`)))
            ),

            // Paikkalista
            (project.locations || []).length === 0 ? 
              e('div', { className: 'text-xs opacity-50 text-center py-8' }, 
                'Ei paikkoja. Klikkaa "Tunnista" tai lisää manuaalisesti.') :
              
              (project.locations || []).map(loc =>
                e('div', {
                  key: loc.id,
                  className: `p-3 rounded border mb-2 ${
                    isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'
                  }`
                },
                  // Paikan nimi ja tyyppi
                  e('div', { className: 'flex items-start justify-between mb-2' },
                    e('div', { className: 'flex-1' },
                      e('div', { className: 'font-medium text-sm mb-1' },
                        LOCATION_TYPES.find(t => t.id === loc.type)?.icon || '📍',
                        ' ',
                        loc.name
                      ),
                      loc.city && e('div', { className: 'text-xs opacity-75' },
                        `${loc.city}${loc.country ? `, ${loc.country}` : ''}`
                      )
                    ),
                    e('button', {
                      onClick: () => {
                        if (confirm(`Poista paikka "${loc.name}"?`)) {
                          setProject({
                            ...project,
                            locations: project.locations.filter(l => l.id !== loc.id)
                          });
                        }
                      },
                      className: 'text-red-500 hover:text-red-600'
                    }, e(Icons.Trash))
                  ),

                  // Stats
                  e('div', { className: 'text-xs opacity-75 mb-2' },
                    `Käytetty: ${loc.used_in_scenes?.length || 0} kohtausta`,
                    loc.genre_descriptions && Object.keys(loc.genre_descriptions).length > 0 &&
                      ` • ${Object.keys(loc.genre_descriptions).length} kuvausta`
                  ),

                  // Toiminnot
                  e('div', { className: 'flex gap-1 mt-2 flex-wrap' },
                    e('button', {
                      onClick: () => {
                        setEditingLocation(loc);
                        setShowLocationSheet(true);
                      },
                      className: 'px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600'
                    }, '✏️ Muokkaa'),
                    
                    e('button', {
                      onClick: () => fetchLocationData(loc),
                      disabled: isGenerating,
                      className: `px-2 py-1 text-xs rounded ${
                        isGenerating 
                          ? 'bg-gray-600 cursor-not-allowed' 
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`
                    }, '🔍 Hae tiedot'),
                    
                    e('button', {
                      onClick: () => generateLocationDescription(loc),
                      disabled: isGenerating,
                      className: `px-2 py-1 text-xs rounded ${
                        isGenerating 
                          ? 'bg-gray-600 cursor-not-allowed' 
                          : 'bg-purple-500 text-white hover:bg-purple-600'
                      }`
                    }, '✍️ Generoi kuvaus')
                  )
                )
              ),

            // Lisää paikka manuaalisesti
            e('button', {
              onClick: () => {
                const newLoc = {
                  ...LOCATION_TEMPLATE,
                  id: Date.now(),
                  name: 'Uusi paikka'
                };
                setProject({
                  ...project,
                  locations: [...(project.locations || []), newLoc]
                });
              },
              className: 'w-full px-3 py-2 text-sm rounded border-2 border-dashed hover:bg-gray-700 transition-colors',
              style: { borderColor: isDarkMode ? '#4b5563' : '#d1d5db' }
            }, '+ Lisää paikka manuaalisesti')
          ),
          // TARINA-välilehti (StoryKeeper)
          inspectorTab === 'story' && e('div', { className: 'space-y-3' },
            // Header
            e('div', { className: 'flex items-center justify-between mb-3' },
              e('h4', { className: 'text-sm font-semibold flex items-center gap-2' },
                e('span', null, '📖 Tarina'),
                e('span', { className: 'text-xs opacity-50 font-normal' }, 
                  `${project.story?.outline?.length || 0} lukua`)
              ),
              e('button', {
                onClick: () => checkStoryLogic(),
                disabled: isGenerating,
                className: `px-2 py-1 text-xs rounded ${
                  isGenerating 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-purple-500 text-white hover:bg-purple-600'
                }`,
                title: 'Tarkista juonen logiikka'
              }, '🔍 Tarkista juoni')
            ),

            // Lukujen lista
            e('div', { className: 'space-y-2' },
              e('div', { className: 'text-xs font-semibold opacity-75 mb-1' }, 'LUVUT'),
              
              (project.story?.outline || []).length === 0 ?
                e('div', { className: 'text-xs opacity-50 text-center py-4' },
                  'Ei lukuja. Luo tarinan rakenne.') :
                
                (project.story.outline || []).map((chapter, idx) =>
                  e('div', {
                    key: idx,
                    className: `p-2 rounded border text-xs ${
                      chapter.status === 'completed' 
                        ? (isDarkMode ? 'bg-green-900/20 border-green-700' : 'bg-green-50 border-green-300')
                        : chapter.status === 'in_progress'
                        ? (isDarkMode ? 'bg-blue-900/20 border-blue-700' : 'bg-blue-50 border-blue-300')
                        : (isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200')
                    }`
                  },
                    e('div', { className: 'flex items-start justify-between mb-1' },
                      e('div', { className: 'flex-1' },
                        e('div', { className: 'font-medium' },
                          `${chapter.chapter}. ${chapter.title || 'Nimetön luku'}`
                        ),
                        chapter.summary && e('div', { className: 'opacity-75 mt-1' }, 
                          chapter.summary.substring(0, 60) + (chapter.summary.length > 60 ? '...' : '')
                        )
                      ),
                      e('div', { className: 'flex gap-1' },
                        chapter.status === 'completed' && e('span', { title: 'Valmis' }, '✓'),
                        chapter.status === 'in_progress' && e('span', { title: 'Kirjoitetaan' }, '✍️'),
                        chapter.status === 'not_started' && e('span', { title: 'Ei aloitettu', className: 'opacity-50' }, '○')
                      )
                    ),
                    
                    chapter.key_events && chapter.key_events.length > 0 && 
                      e('div', { className: 'mt-1 opacity-75' },
                        `${chapter.key_events.length} tapahtumaa`
                      ),
                    
                    e('button', {
                      onClick: () => {
                        setEditingChapter(chapter);
                        setShowChapterSheet(true);
                      },
                      className: 'mt-2 px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600'
                    }, '✏️ Muokkaa')
                  )
                )
            ),

            // Lisää luku
            e('button', {
              onClick: () => {
                const newChapter = {
                  ...CHAPTER_TEMPLATE,
                  chapter: (project.story.outline?.length || 0) + 1
                };
                setProject({
                  ...project,
                  story: {
                    ...project.story,
                    outline: [...(project.story.outline || []), newChapter]
                  }
                });
              },
              className: 'w-full px-3 py-2 text-sm rounded transition-all',
              style: {
                background: 'var(--faust-gold)',
                color: '#141210',
                fontWeight: '500'
              }
            }, '+ Lisää luku'),

            // JUONILANGAT
            e('div', { className: 'mt-4' },
              e('div', { className: 'text-xs font-semibold opacity-75 mb-2 flex items-center justify-between' },
                e('span', null, 'JUONILANGAT'),
                e('button', {
                  onClick: () => {
                    const newThread = {
                      ...THREAD_TEMPLATE,
                      id: Date.now(),
                      name: 'Uusi juonilanka'
                    };
                    setProject({
                      ...project,
                      story: {
                        ...project.story,
                        threads: [...(project.story.threads || []), newThread]
                      }
                    });
                  },
                  className: 'px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600'
                }, '+')
              ),

              (project.story?.threads || []).length === 0 ?
                e('div', { className: 'text-xs opacity-50 text-center py-2' },
                  'Ei juonilankoja') :
                
                (project.story.threads || []).map(thread =>
                  e('div', {
                    key: thread.id,
                    className: `p-2 rounded border text-xs mb-2 ${
                      thread.status === 'closed'
                        ? (isDarkMode ? 'bg-green-900/20 border-green-700' : 'bg-green-50 border-green-300')
                        : thread.importance === 'major'
                        ? (isDarkMode ? 'bg-red-900/20 border-red-700' : 'bg-red-50 border-red-300')
                        : (isDarkMode ? 'bg-yellow-900/20 border-yellow-700' : 'bg-yellow-50 border-yellow-300')
                    }`
                  },
                    e('div', { className: 'flex items-start justify-between' },
                      e('div', { className: 'flex-1' },
                        e('div', { className: 'font-medium flex items-center gap-1' },
                          thread.importance === 'major' ? '🔴' : 
                          thread.importance === 'minor' ? '🟡' : '⚪',
                          thread.name
                        ),
                        e('div', { className: 'opacity-75 mt-1' },
                          thread.status === 'open' 
                            ? `Avattu: Luku ${thread.opened_chapter || '?'}` 
                            : `Suljettu: Luku ${thread.closed_chapter}`
                        )
                      ),
                      e('div', { className: 'flex gap-1' },
                        e('button', {
                          onClick: () => {
                            setEditingThread(thread);
                            setShowThreadSheet(true);
                          },
                          className: 'px-2 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600',
                          title: 'Muokkaa'
                        }, '✏️'),
                        thread.status === 'open' && e('button', {
                          onClick: () => {
                            setProject({
                              ...project,
                              story: {
                                ...project.story,
                                threads: project.story.threads.map(t =>
                                  t.id === thread.id 
                                    ? { ...t, status: 'closed', closed_chapter: getActiveItem()?.metadata?.chapter || '?' }
                                    : t
                                )
                              }
                            });
                          },
                          className: 'px-2 py-1 text-xs rounded bg-green-600 hover:bg-green-700 text-white',
                          title: 'Merkitse suljetuksi'
                        }, '✓')
                      )
                    )
                  )
                )
            )
          )
        )
      ),

      // Vaihe 5: Tekniikat-paneeli
      e('aside', {
        className: `w-80 border-l overflow-y-auto ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`
      },
        e('div', { className: 'p-4 space-y-4' },
          e('div', { className: 'flex items-center justify-between' },
            e('div', { className: 'flex items-center gap-2' },
              e('span', { className: 'text-lg' }, '🎨'),
              e('h3', { className: 'font-semibold' }, 'Kirjoitustekniikat')
            ),
            e('button', {
              onClick: () => setAiAssistantOpen(false),
              className: 'p-1 rounded hover:bg-gray-700'
            }, e(Icons.X))
          ),

          // Tekniikkakategoriat
          Object.entries(WRITING_TECHNIQUES).map(([categoryKey, category]) =>
            e('div', { key: categoryKey, className: 'space-y-2' },
              e('h4', { className: 'text-sm font-medium opacity-75' }, category.title),
              e('div', { className: 'grid grid-cols-1 gap-1' },
                category.techniques.map(technique =>
                  e('button', {
                    key: technique.id,
                    onClick: () => {
                      // Käytä tekniikkaa nykyiseen sisältöön
                      const activeItem = getActiveItem();
                      const prompt = technique.prompt
                        .replace(/\{\{CONTENT\}\}/g, activeItem?.content?.substring(0,100) || '')
                        .replace('{characterList}', project.characters?.map(char => `
- ${char.name} (${char.bio.age || '?'}v, ${char.bio.occupation || 'ammatti?'})
  Tavoite: ${char.psychology.want || '?'}
  Pelko: ${char.psychology.fear || '?'}
  Puhetyyli: ${char.voice.description || '?'}
`).join('\n') || 'Ei hahmoja määriteltynä')
                        .replace('{selectedCharacter}', editingCharacter ? `${editingCharacter.name} (${editingCharacter.bio.age || '?'}v)` : 'Ei valittua hahmoa')
                        .replace('{voiceDescription}', editingCharacter?.voice?.description || 'Ei määritelty')
                        .replace('{lexicon}', editingCharacter?.voice?.lexicon?.join(', ') || 'Ei määritelty')
                        .replace('{avgSentenceLength}', editingCharacter?.voice?.avgSentenceLength || '12')
                        .replace('{want}', editingCharacter?.psychology?.want || 'Ei määritelty')
                        .replace('{fear}', editingCharacter?.psychology?.fear || 'Ei määritelty')
                        .replace('{weakness}', editingCharacter?.psychology?.weakness || 'Ei määritelty')
                        .replace('{values}', editingCharacter?.psychology?.values?.join(', ') || 'Ei määritelty')
                        .replace('{resources}', editingCharacter?.state?.resources?.join(', ') || 'Ei määritelty')
                        .replace('{injuries}', editingCharacter?.state?.injuries?.join(', ') || 'Ei määritelty')
                        .replace('{appearance}', editingCharacter?.bio?.appearance || 'Ei määritelty')
                        .replace('{beliefs}', JSON.stringify(editingCharacter?.state?.beliefs || {}));

                      if (!aiAssistantOpen) setAiAssistantOpen(true);
                      setAiPrompt(`${technique.name}: ${technique.description}`);
                      callAIAPI(prompt, false);
                    },
                    className: `w-full text-left p-2 rounded text-xs transition-colors ${
                      isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'
                    }`,
                    title: technique.description
                  }, technique.name)
              )
            )
          )
        )
      )
      ),

      // AI Assistant - Unified Panel with Tabs
      aiAssistantOpen && e('aside', {
        className: `w-96 border-l overflow-y-auto flex flex-col`,
        style: {
          background: 'var(--faust-dark)',
          borderColor: 'var(--faust-border)'
        }
      },
        // Header
        e('div', { 
          className: 'p-4 border-b flex items-center justify-between',
          style: { borderColor: 'var(--faust-border)' }
        },
          e('div', { className: 'flex items-center gap-2' },
            e(Icons.Sparkles, { 
              className: 'w-5 h-5',
              style: { color: 'var(--faust-gold)' }
            }),
            e('h3', { 
              className: 'font-semibold',
              style: { 
                color: 'var(--faust-text-primary)',
                fontFamily: 'var(--font-heading)'
              }
            }, 'AI-Paneeli')
          ),
          e('button', { 
            onClick: () => setAiAssistantOpen(false), 
            className: 'p-1 rounded transition-colors',
            style: {
              background: 'rgba(154, 123, 79, 0.15)',
              color: 'var(--faust-text-primary)'
            }
          }, e(Icons.X))
        ),
        
        // AI Provider Selection (shared across all tabs)
        e('div', { 
          className: 'p-4 border-b',
          style: { borderColor: 'var(--faust-border)' }
        },
          e('label', { 
            className: 'text-xs block mb-2',
            style: { color: 'var(--faust-text-secondary)' }
          }, 'AI-palvelu'),
          e('select', {
            value: selectedAIApi,
            onChange: (ev) => setSelectedAIApi(ev.target.value),
            className: 'w-full p-2 rounded border text-sm',
            style: {
              background: 'var(--faust-paper)',
              color: 'var(--faust-ink)',
              borderColor: 'var(--faust-border)',
              fontFamily: 'var(--font-body)'
            }
          }, [
            e('option', { key: 'claude', value: 'claude' }, 'Claude (Anthropic)'),
            e('option', { key: 'grok', value: 'grok' }, 'Grok (xAI)'),
            e('option', { key: 'openai', value: 'openai' }, 'OpenAI (GPT-4)'),
            e('option', { key: 'gemini', value: 'gemini' }, 'Gemini (Google)'),
            e('option', { key: 'cursor', value: 'cursor' }, 'Cursor'),
            e('option', { key: 'deepseek', value: 'deepseek' }, 'DeepSeek')
          ])
        ),
        
        // Tabs
        e('div', { 
          className: 'flex border-b',
          style: { 
            borderColor: 'var(--faust-border)',
            background: 'var(--faust-shadow)'
          }
        },
          ['chat', 'quick', 'techniques', 'continuity'].map(tab => {
            const labels = { chat: 'Chat', quick: 'Pikatoiminnot', techniques: 'Tekniikat', continuity: 'Jatkuvuus' };
            const isActive = aiPanelTab === tab;
            return e('button', {
              key: tab,
              onClick: () => setAiPanelTab(tab),
              className: 'flex-1 px-4 py-2 text-sm transition-all',
              style: {
                background: isActive ? 'var(--faust-gold)' : 'transparent',
                color: isActive ? '#141210' : 'var(--faust-text-secondary)',
                borderBottom: isActive ? '2px solid var(--faust-gold)' : '2px solid transparent',
                fontWeight: isActive ? '600' : '400',
                fontFamily: 'var(--font-body)'
              }
            }, labels[tab]);
          })
        ),
        // Tab Content
        e('div', { className: 'flex-1 overflow-y-auto p-4 space-y-4' },
          // CHAT TAB
          aiPanelTab === 'chat' && e('div', { className: 'space-y-4' },
            e('div', null,
              e('label', { 
                className: 'text-sm block mb-2',
                style: { color: 'var(--faust-text-secondary)' }
              }, 'Viesti'),
              e('textarea', {
                value: aiPrompt,
                onChange: (ev) => setAiPrompt(ev.target.value),
                placeholder: 'Kysy AI:lta mitä tahansa...',
                className: 'w-full h-32 p-3 rounded border resize-none text-sm',
                style: {
                  background: 'var(--faust-paper)',
                  color: 'var(--faust-ink)',
                  borderColor: 'var(--faust-border)',
                  fontFamily: 'var(--font-body)'
                }
              }),
              e('button', {
                onClick: () => callAIAPI(aiPrompt, true),
                disabled: isGenerating || !aiPrompt.trim(),
                className: 'w-full mt-2 px-4 py-2 rounded font-medium flex items-center justify-center gap-2 transition-all',
                style: isGenerating || !aiPrompt.trim() ? {
                  background: '#4b5563',
                  color: '#9ca3af',
                  cursor: 'not-allowed'
                } : {
                  background: 'var(--faust-gold)',
                  color: '#141210',
                  fontWeight: '500'
                }
              }, isGenerating ? [e(Icons.Loader), ' Luodaan...'] : 'Lähetä')
            ),
            aiResponse && e('div', {
              className: 'p-4 rounded border',
              style: {
                background: 'var(--faust-paper)',
                borderColor: 'var(--faust-border)'
              }
            },
              e('div', { className: 'flex items-center justify-between mb-2' },
                e('h4', { 
                  className: 'text-sm font-medium',
                  style: { color: 'var(--faust-ink)' }
                }, 'Vastaus'),
                e('div', { className: 'flex gap-2' },
                  // Korvaa valinta -nappi (näkyy vain kun teksti valittuna)
                  selectedText && e('button', {
                    onClick: () => insertAiResponse('replace-selection'),
                    className: 'flex-1 text-xs px-3 py-2 rounded transition-all font-medium',
                    style: {
                      background: '#8B5CF6',
                      color: 'white',
                      fontWeight: '500'
                    }
                  }, '↺ Korvaa valinta'),
                  
                  // Dropdown-valikko
                  e('div', { className: 'relative', style: { flex: selectedText ? '' : '1' } },
                e('button', {
                      onClick: () => {
                        if (!selectedText) {
                          // Jos ei valintaa, lisää suoraan loppuun
                          insertAiResponse('append');
                        } else {
                          // Jos valinta, näytä menu
                          setShowInsertMenu(!showInsertMenu);
                        }
                      },
                      className: 'text-xs px-3 py-2 rounded transition-all',
                  style: {
                    background: 'var(--faust-gold)',
                    color: '#141210',
                        fontWeight: '500',
                        width: selectedText ? 'auto' : '100%'
                      }
                    }, selectedText ? '▼' : 'Lisää tekstiin'),
                    
                    // Dropdown menu
                    showInsertMenu && e('div', {
                      className: 'absolute right-0 mt-1 rounded-lg shadow-xl p-1 min-w-[180px] z-10',
                      style: {
                        background: isDarkMode ? '#1F2937' : 'white',
                        border: `1px solid ${isDarkMode ? '#374151' : '#E5E7EB'}`
                      }
                    },
                      [
                        { label: '➕ Lisää loppuun', mode: 'append' },
                        { label: '📍 Lisää kursorin kohtaan', mode: 'at-cursor' },
                        { label: '⚠️ Korvaa kaikki', mode: 'replace-all', danger: true }
                      ].map(({ label, mode, danger }) =>
                        e('button', {
                          key: mode,
                          onClick: () => insertAiResponse(mode),
                          className: 'w-full text-left px-3 py-2 rounded text-xs transition-all',
                          style: {
                            color: danger ? '#EF4444' : (isDarkMode ? '#F9FAFB' : '#111827'),
                            background: 'transparent'
                          },
                          onMouseEnter: (ev) => {
                            ev.target.style.background = isDarkMode ? '#374151' : '#F3F4F6';
                          },
                          onMouseLeave: (ev) => {
                            ev.target.style.background = 'transparent';
                          }
                        }, label)
                      )
                    )
                  )
                )
              ),
              e('div', { 
                className: 'text-sm whitespace-pre-wrap',
                style: { 
                  color: 'var(--faust-ink)',
                  fontFamily: 'var(--font-body)'
                }
              }, aiResponse)
            )
          ),
          
          // QUICK ACTIONS TAB
          aiPanelTab === 'quick' && e('div', { className: 'grid grid-cols-2 gap-2' },
            aiPrompts.map((item, idx) =>
              e('button', {
                key: idx,
                onClick: () => { 
                  setAiPrompt(item.prompt); 
                  callAIAPI(item.prompt, true);
                  setAiPanelTab('chat'); // Switch to chat to see response
                },
                disabled: isGenerating,
                className: 'p-3 text-sm rounded border transition-all text-left',
                style: {
                  background: 'rgba(154, 123, 79, 0.1)',
                  borderColor: 'var(--faust-border)',
                  color: 'var(--faust-text-primary)',
                  fontFamily: 'var(--font-body)',
                  opacity: isGenerating ? 0.5 : 1
                }
              }, item.label)
            )
          ),
          
          // TECHNIQUES TAB
          aiPanelTab === 'techniques' && e('div', { className: 'space-y-3' },
            Object.entries(WRITING_TECHNIQUES).map(([categoryKey, category]) =>
              e('div', { key: categoryKey, className: 'space-y-2' },
                e('h4', { 
                  className: 'text-sm font-medium mb-2',
                  style: { color: 'var(--faust-gold)' }
                }, category.title),
                category.techniques.map(technique =>
                  e('button', {
                    key: technique.id,
                    onClick: () => {
                      const activeItem = getActiveItem();
                      const prompt = technique.prompt.replace(/\{\{CONTENT\}\}/g, activeItem?.content?.substring(0,100) || '');
                      setAiPrompt(`${technique.name}: ${technique.description}`);
                      callAIAPI(prompt, false);
                      setAiPanelTab('chat'); // Switch to chat to see response
                    },
                    className: 'w-full text-left p-2 rounded text-xs transition-all',
                    style: {
                      background: 'rgba(154, 123, 79, 0.1)',
                      borderColor: 'var(--faust-border)',
                      color: 'var(--faust-text-primary)',
                      fontFamily: 'var(--font-body)'
                    },
                    title: technique.description
                  },
                    e('div', { className: 'font-medium mb-0.5' }, technique.name),
                    e('div', { 
                      className: 'opacity-75 text-[10px]',
                      style: { color: 'var(--faust-text-tertiary)' }
                    }, technique.description)
                  )
                )
              )
            )
    ),

          aiPanelTab === 'continuity' && e('div', { className: 'space-y-4' },
            e('div', {
              className: 'p-4 rounded border',
              style: {
                background: 'var(--faust-shadow)',
                borderColor: 'var(--faust-border)'
              }
  },
    e('div', {
                className: 'flex items-center justify-between mb-3'
              },
                e('h3', {
                  className: 'text-sm font-semibold flex items-center gap-2',
                  style: { color: 'var(--faust-gold)', fontFamily: 'var(--font-heading)' }
                },
                  e('span', null, '🎯'),
                  'Hybrid Writing Mode'
                ),
                e('div', {
                  className: 'text-xs',
                  style: { color: 'var(--faust-text-tertiary)' }
                }, `Akt. luku: ${resolveActiveChapter()}`)
              ),
              e('div', {
                className: 'flex gap-2 mb-3'
              },
                ['write', 'check', 'batch'].map((mode) =>
                  e('button', {
                    key: mode,
                    onClick: () => setContinuityMode(mode),
                    className: 'flex-1 px-3 py-2 rounded text-xs font-medium transition-all',
                    style: {
                      background: continuityMode === mode ? 'var(--faust-gold)' : 'rgba(154, 123, 79, 0.15)',
                      color: continuityMode === mode ? '#141210' : 'var(--faust-text-primary)',
                      border: '1px solid var(--faust-border)'
                    }
                  }, mode === 'write' ? 'Kirjoita' : mode === 'check' ? 'Tarkista' : 'Batch-prosessi')
                )
              ),
    e('div', {
                className: 'grid grid-cols-2 gap-2 text-xs mb-3',
                style: { color: 'var(--faust-text-secondary)' }
              },
                e('div', null, `DeepSeek-tarkistuksia: ${StoryContinuityTracker.costs.checks}`),
                e('div', null, `Kustannukset yhteensä: ${Number(StoryContinuityTracker.costs.total || 0).toFixed(4)} €`),
                e('div', null, `Syötetyt tokenit: ${StoryContinuityTracker.costs.tokens.input}`),
                e('div', null, `Tulostetut tokenit: ${StoryContinuityTracker.costs.tokens.output}`),
                e('div', { className: 'col-span-2 opacity-80' }, `Arvio koko romaanille: ${estimatedNovelCost.toFixed(2)} €`)
              ),
            e('div', {
                className: 'grid grid-cols-2 gap-2 text-xs mb-3',
                style: { color: 'var(--faust-text-secondary)' }
              },
                e('div', null, `📍 Timeline: ${StoryContinuityTracker.storyMemory.timeline.length}`),
                e('div', null, `👥 Hahmot: ${Object.keys(StoryContinuityTracker.storyMemory.characterStates).length}`),
                e('div', null, `🧵 Juonilangat: ${Object.keys(StoryContinuityTracker.storyMemory.plotThreads).length}`),
                e('div', null, `📝 Faktat: ${StoryContinuityTracker.storyMemory.establishedFacts.length}`)
              ),
              e('div', { className: 'flex gap-2' },
        e('button', {
                  onClick: downloadMemory,
                  className: 'flex-1 px-3 py-2 rounded text-xs font-medium transition-all',
                  style: {
                    background: 'rgba(154, 123, 79, 0.2)',
                    color: 'var(--faust-text-primary)',
                    border: '1px solid var(--faust-border)'
                  }
                }, '💾 Vie muisti'),
        e('button', {
                  onClick: async () => {
                    await StoryContinuityTracker.compressMemory();
                    setAiProgress({ stage: 'memory', message: 'Muisti tiivistetty' });
                  },
                  className: 'flex-1 px-3 py-2 rounded text-xs font-medium transition-all',
                  style: {
                    background: 'rgba(154, 123, 79, 0.2)',
                    color: 'var(--faust-text-primary)',
                    border: '1px solid var(--faust-border)'
                  }
                }, '🗜️ Tiivistä muisti')
              )
            ),

            continuityMode === 'write' && e('div', { className: 'space-y-3' },
            e('textarea', {
                value: aiPrompt,
                onChange: (ev) => setAiPrompt(ev.target.value),
                placeholder: 'Kirjoita kohtauksen ohje tai jatko...',
                className: 'w-full h-28 p-3 rounded border text-sm resize-none',
                style: {
                  background: 'var(--faust-paper)',
                  color: 'var(--faust-ink)',
                  borderColor: 'var(--faust-border)',
                  fontFamily: 'var(--font-body)'
                }
              }),
              e('div', { className: 'flex flex-col gap-2 text-xs', style: { color: 'var(--faust-text-secondary)' } },
                e('label', { className: 'flex items-center gap-2' },
              e('input', {
                    type: 'checkbox',
                    checked: checkFirst,
                    onChange: (ev) => setCheckFirst(ev.target.checked)
                  }),
                  'Tarkista ennen kirjoittamista'
                ),
                e('label', { className: 'flex items-center gap-2' },
              e('input', {
                    type: 'checkbox',
                    checked: autoFix,
                    onChange: (ev) => setAutoFix(ev.target.checked)
                  }),
                  'Korjaa jatkuvuus automaattisesti'
                )
              ),
          e('button', {
                onClick: async () => {
                  if (!aiPrompt.trim()) return;
                  setIsGenerating(true);
                  setAiProgress({ stage: 'writing', message: 'Kirjoitetaan...' });
                  try {
                    const chapter = resolveActiveChapter();
                    const result = await HybridWritingFlow.writeWithContinuity(aiPrompt, {
                      chapter,
                      checkFirst,
                      autoFix,
                      onProgress: handleAIProgress
                    });
                    if (result.success && result.data) {
                      insertAtCursor(`\n${result.data}\n`);
                      setAiResponse(result.data);
                      if (result.continuityCheck?.issues?.length) {
                        setContinuityWarnings([{ character: 'Jatkuvuus', issues: result.continuityCheck.issues }]);
                      }
                    } else if (result.issues) {
                      setContinuityWarnings([{ character: 'Jatkuvuus', issues: result.issues }]);
                    }
                  } catch (error) {
                    console.error('Hybrid writing failed', error);
                    setAiProgress({ stage: 'error', message: error.message });
                  } finally {
                    setIsGenerating(false);
                  }
                },
                disabled: isGenerating || !aiPrompt.trim(),
                className: 'w-full px-4 py-2 rounded text-sm font-medium transition-all flex items-center justify-center gap-2',
                style: isGenerating || !aiPrompt.trim()
                  ? { background: '#4b5563', color: '#9ca3af', cursor: 'not-allowed' }
                  : { background: 'var(--faust-gold)', color: '#141210', border: '1px solid var(--faust-border)' }
              }, isGenerating ? [e(Icons.Loader, { className: 'w-4 h-4 animate-spin' }), ' Kirjoitetaan...'] : '✍️ Kirjoita jatkuvuuden kanssa'),
              aiProgress && e('div', {
                className: 'text-xs italic',
                style: { color: 'var(--faust-text-secondary)' }
              }, aiProgress.message || aiProgress.stage)
            ),

            continuityMode === 'check' && e('div', { className: 'space-y-3' },
              e('button', {
                onClick: checkFullStory,
                className: 'w-full px-4 py-2 rounded text-sm font-medium transition-all flex items-center justify-center gap-2',
                style: {
                  background: 'rgba(154, 123, 79, 0.2)',
                  color: 'var(--faust-text-primary)',
                  border: '1px solid var(--faust-border)'
                }
              }, '🔍 Skannaa koko tarina'),
              aiProgress && e('div', {
                className: 'text-xs italic',
                style: { color: 'var(--faust-text-secondary)' }
              }, aiProgress.message || aiProgress.stage),
              Array.isArray(continuityStatus) && continuityStatus.length > 0 && e('div', {
                className: 'space-y-2'
              },
                continuityStatus.map((issue, idx) =>
      e('div', {
                    key: idx,
                    className: 'p-2 rounded border text-xs',
                    style: {
                      background: 'rgba(255, 159, 64, 0.1)',
                      borderColor: 'rgba(255, 159, 64, 0.3)',
                      color: 'var(--faust-text-primary)'
                    }
                  },
                    e('div', { className: 'font-medium flex items-center gap-2 mb-1' },
                      e('span', null, issue.chapter ? `Luku ${issue.chapter}` : 'Tuntematon luku'),
                      e('span', { style: { color: '#FF9F40' } }, issue.type || 'issue')
                    ),
                    e('div', null, issue.detail || issue.description || JSON.stringify(issue)),
                    issue.suggestion && e('div', {
                      className: 'mt-1 italic',
                      style: { color: 'var(--faust-text-tertiary)' }
                    }, `Ehdotus: ${issue.suggestion}`)
                  )
                )
              )
            ),

            continuityMode === 'batch' && e('div', { className: 'space-y-3' },
              e('div', { className: 'flex flex-col gap-2 text-xs', style: { color: 'var(--faust-text-secondary)' } },
                e('label', { className: 'flex flex-col gap-1' },
                  e('span', null, 'Toiminto'),
              e('select', {
                    value: batchOperation,
                    onChange: (ev) => setBatchOperation(ev.target.value),
                    className: 'w-full p-2 rounded border text-xs',
                    style: {
                      background: 'var(--faust-paper)',
                      color: 'var(--faust-ink)',
                      borderColor: 'var(--faust-border)'
                    }
                  },
                    e('option', { value: 'continuityCheck' }, 'Vain tarkistus'),
                    e('option', { value: 'rewrite' }, 'Korjaa ongelmat'),
                    e('option', { value: 'polish' }, 'Viimeistele tekstin laatu')
                  )
                ),
                e('label', { className: 'flex items-center gap-2' },
                  e('span', null, 'Luvut:'),
              e('input', {
                type: 'number',
                    min: 1,
                    value: batchStartChapter,
                    onChange: (ev) => setBatchStartChapter(Number(ev.target.value) || 1),
                    className: 'w-20 p-2 rounded border text-xs',
                    style: {
                      background: 'var(--faust-paper)',
                      color: 'var(--faust-ink)',
                      borderColor: 'var(--faust-border)'
                    }
                  }),
                  e('span', null, '→'),
              e('input', {
                type: 'number',
                    min: 1,
                    value: batchEndChapter,
                    onChange: (ev) => setBatchEndChapter(Number(ev.target.value) || 1),
                    className: 'w-20 p-2 rounded border text-xs',
                    style: {
                      background: 'var(--faust-paper)',
                      color: 'var(--faust-ink)',
                      borderColor: 'var(--faust-border)'
                    }
                  })
                )
              ),
          e('button', {
                onClick: startBatchProcess,
                className: 'w-full px-4 py-2 rounded text-sm font-medium transition-all flex items-center justify-center gap-2',
                style: {
                  background: 'rgba(154, 123, 79, 0.2)',
                  color: 'var(--faust-text-primary)',
                  border: '1px solid var(--faust-border)'
                }
              }, '🚀 Käynnistä batch-prosessi'),
              batchProgress && e('div', {
                className: 'w-full bg-black/30 rounded h-2 overflow-hidden'
              },
                e('div', {
                  className: 'h-full bg-[var(--faust-gold)] transition-all',
                  style: {
                    width: `${Math.min(100, (batchProgress.current / batchProgress.total) * 100)}%`
                  }
                })
              ),
              aiProgress && e('div', {
                className: 'text-xs italic',
                style: { color: 'var(--faust-text-secondary)' }
              }, aiProgress.message || aiProgress.stage)
            )
          )
        )
      ),
    
    // ========== NORMAN-KRUG-NATSUME: UI Components ==========
    
    // NORMAN: AI Feedback - Shows what AI did
    e(AIFeedback, {
      action: showAIFeedback?.action,
      details: showAIFeedback?.details,
      type: showAIFeedback?.type || 'info',
      onDismiss: () => setShowAIFeedback(null)
    }),
    
    // NATSUME: Inspiration Panel - Appears when stuck
    e(InspirationPanel, {
      isVisible: showInspiration,
      inspiration: inspirationData,
      onDismiss: () => setShowInspiration(false)
    }),
    
    // NATSUME: Flow Mode Indicator - Subtle mode display
    e(FlowModeIndicator, { mode: flowMode }),
    
    // NATSUME: Genre Visual Metaphor - Shows genre theme
    project.genre && e('div', {
      className: 'fixed top-20 left-4 text-4xl opacity-10 pointer-events-none z-10'
    }, GENRE_OPTIONS.find(g => g.id === project.genre)?.icon || ''),
    
    // ========== VISUAL MASTERS: Indicators ==========
    
    // IDEO: Cognitive Load Indicator
    e(CognitiveLoadIndicator, { load: cognitiveLoad }),
    
    // SUPERSIDE: Work Phase Indicator
    e(WorkPhaseIndicator, { phase: workPhase }),
    
    // IDEO: Transparent AI Indicator
    e(TransparentAIIndicator, {
      active: aiTransparency.active,
      thinking: aiTransparency.thinking || isGenerating,
      suggestionCount: aiSuggestions.length
    }), // Last NORMAN component
    
    // Quick Actions popup for selected text
    showQuickActions && selectedText && e('div', {
      className: 'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[9999] rounded-lg shadow-2xl p-3',
      style: {
        background: isDarkMode ? '#1A1815' : '#F8F2E8',
        border: `2px solid ${isDarkMode ? '#715C38' : '#E6DED2'}`,
        boxShadow: isDarkMode 
          ? 'inset 0 1px 0 0 rgba(154,123,79,0.1), 0 8px 32px rgba(0,0,0,0.6)'
          : 'inset 0 1px 0 0 rgba(200,157,94,0.2), 0 8px 32px rgba(0,0,0,0.15)'
      }
    },
      e('div', { 
        className: 'text-xs mb-2 opacity-60', 
        style: { 
          color: isDarkMode ? '#AFA699' : '#5E584D',
          fontFamily: 'IBM Plex Mono'
        } 
      },
        `"${selectedText.substring(0, 50)}${selectedText.length > 50 ? '...' : ''}"`
      ),
      e('div', { className: 'flex gap-2' },
        [
          { icon: '✨', label: 'Paranna', action: 'improve' },
          { icon: '📏', label: 'Lyhennä', action: 'shorten' },
          { icon: '📖', label: 'Laajenna', action: 'expand' },
          { icon: '✅', label: 'Korjaa', action: 'fix' }
        ].map(({ icon, label, action }) =>
          e('button', {
            key: action,
            onClick: () => handleQuickAction(action),
            className: 'px-4 py-2 rounded text-sm font-medium transition-all',
            style: {
              background: isDarkMode ? 'rgba(154, 123, 79, 0.15)' : 'rgba(200, 157, 94, 0.15)',
              color: isDarkMode ? '#E9E4DA' : '#2B241C',
              border: `1px solid ${isDarkMode ? '#715C38' : '#E6DED2'}`,
              fontFamily: 'IBM Plex Mono'
            },
            onMouseEnter: (ev) => {
              ev.target.style.background = isDarkMode ? 'rgba(154, 123, 79, 0.3)' : 'rgba(200, 157, 94, 0.3)';
              ev.target.style.borderColor = isDarkMode ? '#9A7B4F' : '#C89D5E';
            },
            onMouseLeave: (ev) => {
              ev.target.style.background = isDarkMode ? 'rgba(154, 123, 79, 0.15)' : 'rgba(200, 157, 94, 0.15)';
              ev.target.style.borderColor = isDarkMode ? '#715C38' : '#E6DED2';
            },
            title: label
          }, `${icon} ${label}`)
        ),
        e('button', {
          onClick: () => setShowQuickActions(false),
          className: 'px-3 py-2 rounded text-sm transition-all',
          style: {
            background: isDarkMode ? 'rgba(113, 92, 56, 0.2)' : 'rgba(230, 222, 210, 0.5)',
            color: isDarkMode ? '#AFA699' : '#5E584D',
            fontFamily: 'IBM Plex Mono'
          },
          onMouseEnter: (ev) => {
            ev.target.style.background = isDarkMode ? 'rgba(113, 92, 56, 0.3)' : 'rgba(230, 222, 210, 0.8)';
          },
          onMouseLeave: (ev) => {
            ev.target.style.background = isDarkMode ? 'rgba(113, 92, 56, 0.2)' : 'rgba(230, 222, 210, 0.5)';
          }
        }, '✕')
      )
    ),
    
    // ========== MODALS ==========
    
    // CharacterSheet Modal
  showCharacterSheet && editingCharacter && e('div', {
    className: 'fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]',
      onClick: () => setShowCharacterSheet(false),
      style: {
        animation: 'fadeIn 250ms ease-in-out'
      }
  },
    e('div', {
      className: `w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg shadow-xl ${
          isDarkMode ? 'bg-[#1A1815]' : 'bg-[#F8F2E8]'
        }`,
        onClick: (ev) => ev.stopPropagation(),
        style: {
          boxShadow: isDarkMode
            ? 'inset 0 1px 0 0 rgba(154,123,79,0.1), 0 8px 32px rgba(0,0,0,0.6)'
            : 'inset 0 1px 0 0 rgba(200,157,94,0.2), 0 8px 32px rgba(0,0,0,0.15)'
        }
    },
      // Header
        e('div', { 
          className: `p-4 flex items-center justify-between ${
            isDarkMode ? 'border-b border-[#715C38]' : 'border-b border-[#E6DED2]'
          }`
        },
          e('h3', { 
            className: 'text-lg font-bold',
            style: {
              fontFamily: 'EB Garamond',
              color: isDarkMode ? '#E9E4DA' : '#2B241C'
            }
          }, 'Hahmo'),
        e('button', {
          onClick: () => setShowCharacterSheet(false),
            className: `p-2 rounded transition-colors ${
              isDarkMode ? 'hover:bg-[#715C38]' : 'hover:bg-[#E6DED2]'
            }`,
            style: {
              color: isDarkMode ? '#AFA699' : '#5E584D'
            }
        }, e(Icons.X))
      ),

      // Content
        e('div', { className: 'p-4 space-y-4' },
          
          // BIO-OSIO
          e('div', { 
            className: `pb-4 ${isDarkMode ? 'border-b border-[#715C38]' : 'border-b border-[#E6DED2]'}`
          },
            e('h4', { 
              className: 'font-bold mb-3 text-sm',
              style: {
                fontFamily: 'EB Garamond',
                color: isDarkMode ? '#E9E4DA' : '#2B241C'
              }
            }, 'PERUSTIEDOT'),
            
            // Nimi (pakollinen)
            e('div', { className: 'mb-3' },
              e('label', { 
                className: 'text-xs block mb-1',
                style: {
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 
                'Nimi',
                e('span', { 
                  className: 'ml-1',
                  style: { color: isDarkMode ? '#C89D5E' : '#715C38' }
                }, '*')
              ),
              e('input', {
                type: 'text',
                value: editingCharacter?.name || '',
                onChange: (ev) => setEditingCharacter({
                  ...editingCharacter,
                  name: ev.target.value
                }),
                className: `w-full p-2 rounded border ${
                  isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                } ${
                  !editingCharacter?.name?.trim() ? (isDarkMode ? 'border-[#9A7B4F]' : 'border-[#715C38]') : ''
                }`,
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '15px',
                  color: isDarkMode ? '#E9E4DA' : '#2B241C'
                },
                placeholder: 'Hahmon nimi (pakollinen)'
              }),
              !editingCharacter?.name?.trim() && e('p', {
                className: 'text-xs mt-1',
                style: {
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#C89D5E' : '#715C38'
                }
              }, 'Nimi on pakollinen tieto')
            ),
            
            // Ikä ja Sukupuoli (rinnakkain)
            e('div', { className: 'grid grid-cols-2 gap-3 mb-3' },
              // Ikä
        e('div', null,
                e('label', { 
                  className: 'text-xs block mb-1',
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    color: isDarkMode ? '#AFA699' : '#5E584D'
                  }
                }, 'Ikä'),
              e('input', {
                type: 'number',
                  min: 0,
                  max: 999,
                  value: editingCharacter?.age || '',
                onChange: (ev) => setEditingCharacter({
                  ...editingCharacter,
                    age: parseInt(ev.target.value, 10) || 0
                  }),
                  className: `w-full p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Esim. 25'
                })
              ),
              
              // Sukupuoli
            e('div', null,
                e('label', { 
                  className: 'text-xs block mb-1',
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    color: isDarkMode ? '#AFA699' : '#5E584D'
                  }
                }, 'Sukupuoli'),
                e('select', {
                  value: editingCharacter?.gender || 'Ei määritelty',
                onChange: (ev) => setEditingCharacter({
                  ...editingCharacter,
                    gender: ev.target.value
                  }),
                  className: `w-full p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  }
                },
                  e('option', { value: 'Ei määritelty' }, 'Ei määritelty'),
                  e('option', { value: 'Nainen' }, 'Nainen'),
                  e('option', { value: 'Mies' }, 'Mies'),
                  e('option', { value: 'Muu' }, 'Muu')
                )
              )
            ),
            
            // Ulkonäkö + AI button
            e('div', null,
              e('label', { 
                className: 'text-xs block mb-1',
                style: {
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Ulkonäkö'),
              e('div', { className: 'flex gap-2' },
            e('textarea', {
                  rows: 3,
                  value: editingCharacter?.appearance || '',
              onChange: (ev) => setEditingCharacter({
                ...editingCharacter,
                    appearance: ev.target.value
                  }),
                  className: `flex-1 p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Fyysinen ulkonäkö, vaatetus, erityispiirteet...'
                }),
                e('button', {
                  onClick: async () => {
                    try {
                      // TODO: Vaihda HybridWritingFlow vaiheessa 2
                      const prompt = `Luo lyhyt, vivahdikas ulkonäköku vaus hahmolle "${editingCharacter?.name}" (ikä: ${editingCharacter?.age || 'ei määritelty'}, sukupuoli: ${editingCharacter?.gender || 'ei määritelty'}). Anna 2-3 lausetta.`;
                      const result = await window.electronAPI.generateWithAI({
                        prompt,
                        model: 'claude-3-5-sonnet-20241022'
                      });
                      setEditingCharacter({
                        ...editingCharacter,
                        appearance: result.trim()
                      });
                      console.log('✅ AI loi ulkonäkökuvauksen');
                    } catch (error) {
                      console.error('❌ AI-virhe:', error);
                    }
                  },
                  className: `px-3 py-2 rounded text-xs transition-all self-start ${
                    isDarkMode 
                      ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                      : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500'
                  },
                  title: 'Generoi ulkonäkökuvaus AI:n avulla'
                }, '🜓 AI')
              )
            )
          ),
          
          // PERSOONALLISUUS-OSIO
          e('div', { 
            className: `pb-4 ${isDarkMode ? 'border-b border-[#715C38]' : 'border-b border-[#E6DED2]'}`
          },
            e('h4', { 
              className: 'font-bold mb-3 text-sm',
              style: {
                fontFamily: 'EB Garamond',
                color: isDarkMode ? '#E9E4DA' : '#2B241C'
              }
            }, 'PERSOONALLISUUS'),
            
            // Luonteenpiirteet (Traits)
            e('div', { className: 'mb-3' },
              e('label', { 
                className: 'text-xs block mb-1',
                style: {
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Luonteenpiirteet'),
              
              // Trait chips
              e('div', { className: 'flex flex-wrap gap-2 mb-2' },
                (editingCharacter?.traits || []).map((trait, idx) =>
                  e('div', {
                    key: idx,
                    className: `flex items-center gap-1 px-2 py-1 rounded text-xs ${
                      isDarkMode ? 'bg-[#715C38] text-[#E9E4DA]' : 'bg-[#E6DED2] text-[#2B241C]'
                    }`
                  },
                    e('span', null, trait),
                    e('button', {
                      onClick: () => {
                        const newTraits = [...(editingCharacter.traits || [])];
                        newTraits.splice(idx, 1);
                        setEditingCharacter({
                          ...editingCharacter,
                          traits: newTraits
                        });
                      },
                      className: `hover:text-red-500 font-bold ${isDarkMode ? 'text-[#E9E4DA]' : 'text-[#2B241C]'}`
                    }, '×')
                  )
                )
              ),
              
              // Add trait input
              e('div', { className: 'flex gap-2' },
                e('input', {
                  type: 'text',
                  id: 'newTrait',
                  className: `flex-1 p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Esim: Rohkea, Ujo, Viisas...',
                  onKeyPress: (ev) => {
                    if (ev.key === 'Enter') {
                      ev.preventDefault();
                      const input = document.getElementById('newTrait');
                      const value = input.value.trim();
                      if (value) {
                        setEditingCharacter({
                    ...editingCharacter,
                          traits: [...(editingCharacter.traits || []), value]
                        });
                        input.value = '';
                      }
                    }
                  }
                }),
                e('button', {
                  onClick: () => {
                    const input = document.getElementById('newTrait');
                    const value = input.value.trim();
                    if (value) {
                      setEditingCharacter({
                        ...editingCharacter,
                        traits: [...(editingCharacter.traits || []), value]
                      });
                      input.value = '';
                    }
                  },
                  className: `px-3 py-2 rounded text-sm ${
                    isDarkMode ? 'bg-[#9A7B4F] hover:bg-[#C89D5E]' : 'bg-[#C89D5E] hover:bg-[#9A7B4F]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500',
                    color: isDarkMode ? '#100F0D' : 'white'
                  }
                }, '+ Lisää')
              )
            ),
            
            // Motivaatiot + AI button
            e('div', { className: 'mb-3' },
              e('label', { 
                className: 'text-xs block mb-1',
                style: {
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Motivaatiot'),
              e('div', { className: 'flex gap-2' },
            e('textarea', {
                  rows: 2,
                  value: editingCharacter?.motivations || '',
              onChange: (ev) => setEditingCharacter({
                ...editingCharacter,
                    motivations: ev.target.value
                  }),
                  className: `flex-1 p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Mitä hahmo haluaa saavuttaa?'
                }),
                e('button', {
                  onClick: async () => {
                    try {
                      // TODO: Vaihda HybridWritingFlow vaiheessa 2
                      const prompt = `Luo syvälliset motivaatiot hahmolle "${editingCharacter?.name}" (luonteenpiirteet: ${(editingCharacter?.traits || []).join(', ') || 'ei määritelty'}). Anna 1-2 lausetta.`;
                      const result = await window.electronAPI.generateWithAI({
                        prompt,
                        model: 'claude-3-5-sonnet-20241022'
                      });
                      setEditingCharacter({
                ...editingCharacter,
                        motivations: result.trim()
                      });
                      console.log('✅ AI loi motivaatiot');
                    } catch (error) {
                      console.error('❌ AI-virhe:', error);
                    }
                  },
                  className: `px-3 py-2 rounded text-xs transition-all self-start ${
                    isDarkMode 
                      ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                      : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500'
                  },
                  title: 'Generoi motivaatiot AI:n avulla'
                }, '🜓 AI')
              )
            ),
            
            // Pelot + AI button
        e('div', null,
              e('label', { 
                className: 'text-xs block mb-1',
                style: {
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Pelot'),
              e('div', { className: 'flex gap-2' },
                e('textarea', {
                  rows: 2,
                  value: editingCharacter?.fears || '',
                onChange: (ev) => setEditingCharacter({
                  ...editingCharacter,
                    fears: ev.target.value
                  }),
                  className: `flex-1 p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Mitä hahmo pelkää?'
                }),
                e('button', {
                  onClick: async () => {
                    try {
                      // TODO: Vaihda HybridWritingFlow vaiheessa 2
                      const prompt = `Luo uskottavat pelot hahmolle "${editingCharacter?.name}" (motivaatiot: ${editingCharacter?.motivations || 'ei määritelty'}). Anna 1-2 lausetta.`;
                      const result = await window.electronAPI.generateWithAI({
                        prompt,
                        model: 'claude-3-5-sonnet-20241022'
                      });
                      setEditingCharacter({
                        ...editingCharacter,
                        fears: result.trim()
                      });
                      console.log('✅ AI loi pelot');
                    } catch (error) {
                      console.error('❌ AI-virhe:', error);
                    }
                  },
                  className: `px-3 py-2 rounded text-xs transition-all self-start ${
                    isDarkMode 
                      ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                      : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500'
                  },
                  title: 'Generoi pelot AI:n avulla'
                }, '🜓 AI')
              )
            )
          ),
          
          // SUHTEET-OSIO
          e('div', { 
            className: `pb-4 ${isDarkMode ? 'border-b border-[#715C38]' : 'border-b border-[#E6DED2]'}`
          },
            e('h4', { 
              className: 'font-bold mb-3 text-sm',
              style: {
                fontFamily: 'EB Garamond',
                color: isDarkMode ? '#E9E4DA' : '#2B241C'
              }
            }, 'SUHTEET'),
            
            // Olemassa olevat suhteet
            (editingCharacter?.relationships || []).length > 0 && e('div', { className: 'mb-3 space-y-2' },
              (editingCharacter?.relationships || []).map((rel, idx) => {
                const targetChar = project.characters.find(c => c.id === rel.targetCharacterId);
                return e('div', {
                  key: idx,
                  className: `p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`
                },
                  e('div', { className: 'flex items-start justify-between gap-2' },
                    e('div', { 
                      className: 'flex-1',
                      style: {
                        fontFamily: 'IBM Plex Mono',
                        fontSize: '15px',
                        color: isDarkMode ? '#E9E4DA' : '#2B241C'
                      }
                    },
                      e('div', { 
                        className: 'font-bold',
                        style: { 
                          color: isDarkMode ? '#C89D5E' : '#715C38'
                        }
                      }, targetChar?.name || 'Tuntematon'),
                      e('div', { 
                        className: 'text-xs',
                        style: { 
                          opacity: 0.7,
                          color: isDarkMode ? '#AFA699' : '#5E584D'
                        }
                      }, rel.type),
                      rel.description && e('div', { 
                        className: 'text-xs mt-1',
                        style: {
                          color: isDarkMode ? '#E9E4DA' : '#2B241C'
                        }
                      }, rel.description)
                    ),
                    e('button', {
                      onClick: () => {
                        const newRels = [...(editingCharacter.relationships || [])];
                        newRels.splice(idx, 1);
                        setEditingCharacter({
                          ...editingCharacter,
                          relationships: newRels
                        });
                      },
                      className: 'text-red-500 hover:text-red-700 font-bold'
                    }, '×')
                  )
                );
              })
            ),
            
            // Lisää uusi suhde
            e('div', null,
              e('label', { 
                className: 'text-xs block mb-1',
                style: {
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Lisää suhde'),
              
              // Valitse hahmo
              e('div', { className: 'mb-2' },
                e('select', {
                  id: 'newRelationshipTarget',
                  className: `w-full p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  }
                },
                  e('option', { value: '' }, 'Valitse hahmo...'),
                  project.characters
                    .filter(c => c.id !== editingCharacter?.id)
                    .map(c => e('option', { key: c.id, value: c.id }, c.name))
                )
              ),
              
              // Suhteen tyyppi
              e('div', { className: 'mb-2' },
                e('select', {
                  id: 'newRelationshipType',
                  className: `w-full p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  }
                },
                  e('option', { value: 'Neutraali' }, 'Neutraali'),
                  e('option', { value: 'Ystävä' }, 'Ystävä'),
                  e('option', { value: 'Vihollinen' }, 'Vihollinen'),
                  e('option', { value: 'Perhe' }, 'Perhe'),
                  e('option', { value: 'Romanttinen' }, 'Romanttinen')
                )
              ),
              
              // Kuvaus
              e('div', { className: 'mb-2' },
                e('textarea', {
                  id: 'newRelationshipDescription',
                  rows: 2,
                  className: `w-full p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Suhteen kuvaus (valinnainen)'
                })
              ),
              
              // Lisää-nappi
              e('button', {
                onClick: () => {
                  const targetSelect = document.getElementById('newRelationshipTarget');
                  const typeSelect = document.getElementById('newRelationshipType');
                  const descTextarea = document.getElementById('newRelationshipDescription');
                  
                  const targetId = targetSelect.value;
                  const type = typeSelect.value;
                  const description = descTextarea.value.trim();
                  
                  if (targetId) {
                    setEditingCharacter({
                      ...editingCharacter,
                      relationships: [
                        ...(editingCharacter.relationships || []),
                        { targetCharacterId: targetId, type, description }
                      ]
                    });
                    
                    // Tyhjennä kentät
                    targetSelect.value = '';
                    typeSelect.value = 'Neutraali';
                    descTextarea.value = '';
                    
                    console.log('✅ Suhde lisätty');
                  } else {
                    console.warn('⚠️ Valitse ensin hahmo');
                  }
                },
                className: `px-3 py-2 rounded text-sm w-full ${
                  isDarkMode ? 'bg-[#9A7B4F] hover:bg-[#C89D5E]' : 'bg-[#C89D5E] hover:bg-[#9A7B4F]'
                }`,
                style: {
                  fontFamily: 'IBM Plex Mono',
                  fontWeight: '500',
                  color: isDarkMode ? '#100F0D' : 'white'
                }
              }, '+ Lisää suhde')
            )
          ),
          
          // TARINAN KAARI -OSIO
            e('div', null,
            e('h4', { 
              className: 'font-bold mb-3 text-sm',
              style: {
                fontFamily: 'EB Garamond',
                color: isDarkMode ? '#E9E4DA' : '#2B241C'
              }
            }, 'TARINAN KAARI'),
            
            // Aloitus + AI button
            e('div', { className: 'mb-3' },
              e('label', { 
                className: 'text-xs block mb-1',
                style: {
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Aloitus'),
              e('div', { className: 'flex gap-2' },
                e('textarea', {
                  rows: 2,
                  value: editingCharacter?.arc?.beginning || '',
                onChange: (ev) => setEditingCharacter({
                  ...editingCharacter,
                    arc: {
                      ...editingCharacter?.arc,
                      beginning: ev.target.value
                    }
                  }),
                  className: `flex-1 p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Missä hahmo on tarinan alussa?'
                }),
                e('button', {
                  onClick: async () => {
                    try {
                      // TODO: Vaihda HybridWritingFlow vaiheessa 2
                      const prompt = `Luo hahmon kaaren aloituspiste hahmolle "${editingCharacter?.name}" (motivaatiot: ${editingCharacter?.motivations || 'ei määritelty'}, pelot: ${editingCharacter?.fears || 'ei määritelty'}). Anna 1-2 lausetta.`;
                      const result = await window.electronAPI.generateWithAI({
                        prompt,
                        model: 'claude-3-5-sonnet-20241022'
                      });
                      setEditingCharacter({
                        ...editingCharacter,
                        arc: {
                          ...editingCharacter?.arc,
                          beginning: result.trim()
                        }
                      });
                      console.log('✅ AI loi kaaren aloituksen');
                    } catch (error) {
                      console.error('❌ AI-virhe:', error);
                    }
                  },
                  className: `px-3 py-2 rounded text-xs transition-all self-start ${
                    isDarkMode 
                      ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                      : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500'
                  },
                  title: 'Generoi kaaren aloitus AI:n avulla'
                }, '🜓 AI')
              )
            ),
            
            // Kehitys + AI button
            e('div', { className: 'mb-3' },
              e('label', { 
                className: 'text-xs block mb-1',
                style: {
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Kehitys'),
              e('div', { className: 'flex gap-2' },
                e('textarea', {
                  rows: 2,
                  value: editingCharacter?.arc?.development || '',
                  onChange: (ev) => setEditingCharacter({
                    ...editingCharacter,
                    arc: {
                      ...editingCharacter?.arc,
                      development: ev.target.value
                    }
                  }),
                  className: `flex-1 p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Miten hahmo muuttuu tarinan aikana?'
                }),
                e('button', {
                  onClick: async () => {
                    try {
                      // TODO: Vaihda HybridWritingFlow vaiheessa 2
                      const prompt = `Luo hahmon kehityskaari hahmolle "${editingCharacter?.name}" lähtien siitä että ${editingCharacter?.arc?.beginning || 'hahmo aloittaa matkansa'}. Anna 1-2 lausetta.`;
                      const result = await window.electronAPI.generateWithAI({
                        prompt,
                        model: 'claude-3-5-sonnet-20241022'
                      });
                      setEditingCharacter({
                        ...editingCharacter,
                        arc: {
                          ...editingCharacter?.arc,
                          development: result.trim()
                        }
                      });
                      console.log('✅ AI loi kaaren kehityksen');
                    } catch (error) {
                      console.error('❌ AI-virhe:', error);
                    }
                  },
                  className: `px-3 py-2 rounded text-xs transition-all self-start ${
                    isDarkMode 
                      ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                      : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500'
                  },
                  title: 'Generoi kaaren kehitys AI:n avulla'
                }, '🜓 AI')
              )
            ),
            
            // Lopputulos + AI button
        e('div', null,
              e('label', { 
                className: 'text-xs block mb-1',
                style: {
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Lopputulos'),
              e('div', { className: 'flex gap-2' },
          e('textarea', {
                  rows: 2,
                  value: editingCharacter?.arc?.end || '',
            onChange: (ev) => setEditingCharacter({
              ...editingCharacter,
                    arc: {
                      ...editingCharacter?.arc,
                      end: ev.target.value
                    }
                  }),
                  className: `flex-1 p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Missä hahmo päättyy?'
                }),
                e('button', {
                  onClick: async () => {
                    try {
                      // TODO: Vaihda HybridWritingFlow vaiheessa 2
                      const prompt = `Luo tyydyttävä lopputulos hahmon kaarelle "${editingCharacter?.name}" kun hahmo ${editingCharacter?.arc?.development || 'on käynyt läpi muutoksen'}. Anna 1-2 lausetta.`;
                      const result = await window.electronAPI.generateWithAI({
                        prompt,
                        model: 'claude-3-5-sonnet-20241022'
                      });
                      setEditingCharacter({
                        ...editingCharacter,
                        arc: {
                          ...editingCharacter?.arc,
                          end: result.trim()
                        }
                      });
                      console.log('✅ AI loi kaaren lopputuloksen');
                    } catch (error) {
                      console.error('❌ AI-virhe:', error);
                    }
                  },
                  className: `px-3 py-2 rounded text-xs transition-all self-start ${
                    isDarkMode 
                      ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                      : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
                  }`,
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500'
                  },
                  title: 'Generoi kaaren lopputulos AI:n avulla'
                }, '🜓 AI')
              )
            )
        )
      ),

      // Footer
        e('div', { 
          className: `p-4 flex gap-2 justify-end ${
            isDarkMode ? 'border-t border-[#715C38]' : 'border-t border-[#E6DED2]'
          }`
        },
        e('button', {
          onClick: () => setShowCharacterSheet(false),
            className: `px-4 py-2 rounded text-sm transition-all ${
              isDarkMode ? 'bg-[#715C38] hover:bg-[#8C806C]' : 'bg-[#E6DED2] hover:bg-[#867C6B]'
            }`,
            style: {
              fontFamily: 'IBM Plex Mono',
              color: isDarkMode ? '#E9E4DA' : '#2B241C'
            }
        }, 'Peruuta'),
        e('button', {
          onClick: () => {
              if (!editingCharacter?.name?.trim()) {
                console.warn('⚠️ Validointivirhe: Nimi on pakollinen');
                return;
              }
              
              setProject(prev => ({
                ...prev,
                characters: prev.characters.map(c =>
                c.id === editingCharacter.id ? editingCharacter : c
              )
              }));
            setShowCharacterSheet(false);
              console.log('✅ Hahmo tallennettu:', editingCharacter.name);
            },
            disabled: !editingCharacter?.name?.trim(),
            className: `px-4 py-2 rounded text-sm transition-all ${
              !editingCharacter?.name?.trim()
                ? 'bg-[#8C806C] text-[#AFA699] cursor-not-allowed'
                : isDarkMode 
                  ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                  : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
            }`,
            style: {
              fontFamily: 'IBM Plex Mono',
              fontWeight: '500',
              boxShadow: !editingCharacter?.name?.trim() ? 'none' : (isDarkMode 
                ? '0 0 20px rgba(200,157,94,0.3), 0 0 40px rgba(200,157,94,0.15)' 
                : '0 0 20px rgba(200,157,94,0.4), 0 0 40px rgba(200,157,94,0.2)'),
              transition: 'all 0.3s ease'
            },
            onMouseEnter: !editingCharacter?.name?.trim() ? undefined : (ev) => {
              ev.target.style.boxShadow = isDarkMode 
                ? '0 0 30px rgba(200,157,94,0.5), 0 0 60px rgba(200,157,94,0.25)' 
                : '0 0 30px rgba(200,157,94,0.6), 0 0 60px rgba(200,157,94,0.3)';
            },
            onMouseLeave: !editingCharacter?.name?.trim() ? undefined : (ev) => {
              ev.target.style.boxShadow = isDarkMode 
                ? '0 0 20px rgba(200,157,94,0.3), 0 0 40px rgba(200,157,94,0.15)' 
                : '0 0 20px rgba(200,157,94,0.4), 0 0 40px rgba(200,157,94,0.2)';
            },
            title: !editingCharacter?.name?.trim() ? 'Nimi on pakollinen' : 'Tallenna hahmo'
        }, 'Tallenna')
      )
    )
  ),
  
  // LocationSheet Modal
  showLocationSheet && editingLocation && e('div', {
    className: 'fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]',
      onClick: () => setShowLocationSheet(false),
      style: { animation: 'fadeIn 250ms ease-in-out' }
  },
    e('div', {
        className: `w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg ${
          isDarkMode ? 'bg-[#1A1815]' : 'bg-[#F8F2E8]'
        }`,
        onClick: (ev) => ev.stopPropagation(),
        style: { 
          boxShadow: isDarkMode 
            ? 'inset 0 0 16px rgba(0,0,0,0.2), 0 0 40px rgba(0,0,0,0.5)' 
            : 'inset 0 0 16px rgba(0,0,0,0.1), 0 0 40px rgba(0,0,0,0.2)' 
        }
    },
      // Header
        e('div', { 
          className: `p-4 flex items-center justify-between ${
            isDarkMode ? 'border-b border-[#715C38]' : 'border-b border-[#E6DED2]'
          }`
        },
          e('h3', { 
            className: 'text-lg font-bold',
            style: { 
              fontFamily: 'EB Garamond', 
              color: isDarkMode ? '#E9E4DA' : '#2B241C' 
            }
          }, 'Paikka'),
        e('button', {
          onClick: () => setShowLocationSheet(false),
            className: `p-2 rounded transition-all ${
              isDarkMode ? 'hover:bg-[#715C38]' : 'hover:bg-[#E6DED2]'
            }`,
            style: { color: isDarkMode ? '#AFA699' : '#5E584D' }
        }, e(Icons.X))
      ),

      // Content
      e('div', { className: 'p-4 space-y-4' },
          
          // PERUSTIEDOT
          e('div', { 
            className: `pb-4 ${isDarkMode ? 'border-b border-[#715C38]' : 'border-b border-[#E6DED2]'}`
          },
            e('h4', { 
              className: 'font-bold mb-3 text-sm',
              style: { 
                fontFamily: 'EB Garamond',
                color: isDarkMode ? '#E9E4DA' : '#2B241C'
              }
            }, 'PERUSTIEDOT'),
            
            // Nimi (pakollinen)
            e('div', { className: 'mb-3' },
              e('label', { 
                className: 'text-xs block mb-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 
                'Nimi',
                e('span', { 
                  className: 'ml-1',
                  style: { color: isDarkMode ? '#C89D5E' : '#715C38' }
                }, '*')
              ),
              e('input', {
                type: 'text',
                value: editingLocation?.name || '',
                onChange: (ev) => setEditingLocation({
                  ...editingLocation,
                  name: ev.target.value
                }),
                className: `w-full p-2 rounded border ${
                  isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                } ${
                  !editingLocation?.name?.trim() ? (isDarkMode ? 'border-[#9A7B4F]' : 'border-[#715C38]') : ''
                }`,
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '15px',
                  color: isDarkMode ? '#E9E4DA' : '#2B241C'
                },
                placeholder: 'Paikan nimi (pakollinen)'
              }),
              !editingLocation?.name?.trim() && e('p', {
                className: 'text-xs mt-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#C89D5E' : '#715C38'
                }
              }, 'Nimi on pakollinen tieto')
            ),
            
            // Tyyppi
            e('div', { className: 'mb-3' },
              e('label', { 
                className: 'text-xs block mb-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Tyyppi'),
              e('select', {
                value: editingLocation?.type || 'Ei määritelty',
                onChange: (ev) => setEditingLocation({
                  ...editingLocation,
                  type: ev.target.value
                }),
                className: `w-full p-2 rounded border ${
                  isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                }`,
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '15px',
                  color: isDarkMode ? '#E9E4DA' : '#2B241C'
                }
              },
                e('option', { value: 'Ei määritelty' }, 'Ei määritelty'),
                e('option', { value: 'Koti' }, 'Koti'),
                e('option', { value: 'Kaupunki' }, 'Kaupunki'),
                e('option', { value: 'Luonto' }, 'Luonto'),
                e('option', { value: 'Rakennus' }, 'Rakennus'),
                e('option', { value: 'Julkinen tila' }, 'Julkinen tila'),
                e('option', { value: 'Muu' }, 'Muu')
              )
            ),
            
            // Kuvaus + AI button
            e('div', null,
              e('label', { 
                className: 'text-xs block mb-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Kuvaus'),
              e('div', { className: 'flex gap-2' },
                e('textarea', {
                  rows: 3,
                  value: editingLocation?.description || '',
                onChange: (ev) => setEditingLocation({
                  ...editingLocation,
                    description: ev.target.value
                  }),
                  className: `flex-1 p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Paikan yleiskuvaus...'
                }),
                e('button', {
                  onClick: async () => {
                    try {
                      const prompt = `Luo vivahdikas kuvaus paikasta tyyppiä "${editingLocation?.type || 'Ei määritelty'}" nimeltä "${editingLocation?.name}". Anna vain kuvaus, 2-3 lausetta.`;
                      const result = await window.electronAPI.generateWithAI({
                        prompt,
                        model: 'claude-3-5-sonnet-20241022'
                      });
                      setEditingLocation({
                        ...editingLocation,
                        description: result.trim()
                      });
                      console.log('✅ AI loi paikan kuvauksen');
                    } catch (error) {
                      console.error('❌ AI-virhe:', error);
                    }
                  },
                  className: `px-3 py-2 rounded text-xs transition-all self-start ${
                    isDarkMode 
                      ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                      : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
                  }`,
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500'
                  },
                  title: 'Generoi kuvaus AI:n avulla'
                }, '🜓 AI')
              )
            )
          ),
          
          // ATMOSFÄÄRI
          e('div', { 
            className: `pb-4 ${isDarkMode ? 'border-b border-[#715C38]' : 'border-b border-[#E6DED2]'}`
          },
            e('h4', { 
              className: 'font-bold mb-3 text-sm',
              style: { 
                fontFamily: 'EB Garamond',
                color: isDarkMode ? '#E9E4DA' : '#2B241C'
              }
            }, 'ATMOSFÄÄRI'),
            
            // Tunnelma
            e('div', { className: 'mb-3' },
              e('label', { 
                className: 'text-xs block mb-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Tunnelma'),
              e('select', {
                value: editingLocation?.mood || 'Neutraali',
                onChange: (ev) => setEditingLocation({
                  ...editingLocation,
                  mood: ev.target.value
                }),
                className: `w-full p-2 rounded border ${
                  isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                }`,
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '15px',
                  color: isDarkMode ? '#E9E4DA' : '#2B241C'
                }
              },
                e('option', { value: 'Neutraali' }, 'Neutraali'),
                e('option', { value: 'Rauhallinen' }, 'Rauhallinen'),
                e('option', { value: 'Jännittävä' }, 'Jännittävä'),
                e('option', { value: 'Ahdistava' }, 'Ahdistava'),
                e('option', { value: 'Iloinen' }, 'Iloinen'),
                e('option', { value: 'Surullinen' }, 'Surullinen'),
                e('option', { value: 'Pelottava' }, 'Pelottava')
              )
            ),
            
            // Äänet ja tuoksut + AI button (TODO: HybridWritingFlow vaiheessa 2)
        e('div', null,
              e('label', { 
                className: 'text-xs block mb-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Äänet ja tuoksut'),
              e('div', { className: 'flex gap-2' },
          e('textarea', {
                  rows: 2,
                  value: editingLocation?.sensory || '',
            onChange: (ev) => setEditingLocation({
              ...editingLocation,
                    sensory: ev.target.value
                  }),
                  className: `flex-1 p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Mitä paikkaa kuvaavia ääniä tai tuoksuja?'
                }),
                e('button', {
                  onClick: async () => {
                    try {
                      // TODO: Vaihda HybridWritingFlow-integraatioon vaiheessa 2
                      const prompt = `Luo aistikokemuksia paikasta "${editingLocation?.name}" (tyyppi: ${editingLocation?.type}, tunnelma: ${editingLocation?.mood}). Anna 2-3 lausetta ääniä ja tuoksuja.`;
                      const result = await window.electronAPI.generateWithAI({
                        prompt,
                        model: 'claude-3-5-sonnet-20241022'
                      });
                      setEditingLocation({
                        ...editingLocation,
                        sensory: result.trim()
                      });
                      console.log('✅ AI loi aistikokemuksia');
                    } catch (error) {
                      console.error('❌ AI-virhe:', error);
                    }
                  },
                  className: `px-3 py-2 rounded text-xs transition-all self-start ${
                    isDarkMode 
                      ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                      : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
                  }`,
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500'
                  },
                  title: 'Generoi atmosfääri AI:n avulla'
                }, '🜓 AI')
              )
            )
          ),
          
          // KÄYTTÖ TARINASSA
          e('div', null,
            e('h4', { 
              className: 'font-bold mb-3 text-sm',
              style: { 
                fontFamily: 'EB Garamond',
                color: isDarkMode ? '#E9E4DA' : '#2B241C'
              }
            }, 'KÄYTTÖ TARINASSA'),
            
            // Tärkeys
            e('div', null,
              e('label', { 
                className: 'text-xs block mb-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Tärkeys'),
              e('select', {
                value: editingLocation?.importance || 'Sivupaikka',
                onChange: (ev) => setEditingLocation({
                  ...editingLocation,
                  importance: ev.target.value
                }),
                className: `w-full p-2 rounded border ${
                  isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                }`,
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '15px',
                  color: isDarkMode ? '#E9E4DA' : '#2B241C'
                }
              },
                e('option', { value: 'Pääpaikka' }, 'Pääpaikka - Keskeinen tarinalle'),
                e('option', { value: 'Sivupaikka' }, 'Sivupaikka - Esiintyy useasti'),
                e('option', { value: 'Mainittu' }, 'Mainittu - Vain viittaus')
            )
          )
        )
      ),

      // Footer
        e('div', { 
          className: `p-4 flex gap-2 justify-end ${
            isDarkMode ? 'border-t border-[#715C38]' : 'border-t border-[#E6DED2]'
          }`
        },
        e('button', {
          onClick: () => setShowLocationSheet(false),
            className: `px-4 py-2 rounded text-sm transition-all ${
              isDarkMode ? 'bg-[#715C38] hover:bg-[#8C806C]' : 'bg-[#E6DED2] hover:bg-[#867C6B]'
            }`,
            style: { 
              fontFamily: 'IBM Plex Mono',
              color: isDarkMode ? '#E9E4DA' : '#2B241C'
            }
        }, 'Peruuta'),
        e('button', {
          onClick: () => {
              if (!editingLocation?.name?.trim()) {
                console.warn('⚠️ Validointivirhe: Nimi on pakollinen');
                return;
              }
              
              setProject(prev => ({
                ...prev,
                locations: prev.locations.map(l =>
                  l.id === editingLocation.id ? editingLocation : l
                )
              }));
            setShowLocationSheet(false);
              console.log('✅ Paikka tallennettu:', editingLocation.name);
            },
            disabled: !editingLocation?.name?.trim(),
            className: `px-4 py-2 rounded text-sm transition-all ${
              !editingLocation?.name?.trim()
                ? 'bg-[#8C806C] text-[#AFA699] cursor-not-allowed'
                : isDarkMode 
                  ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                  : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
            }`,
            style: { 
              fontFamily: 'IBM Plex Mono',
              fontWeight: '500',
              boxShadow: !editingLocation?.name?.trim() ? 'none' : (isDarkMode 
                ? '0 0 20px rgba(200,157,94,0.3), 0 0 40px rgba(200,157,94,0.15)' 
                : '0 0 20px rgba(200,157,94,0.4), 0 0 40px rgba(200,157,94,0.2)'),
              transition: 'all 0.3s ease'
            },
            onMouseEnter: !editingLocation?.name?.trim() ? undefined : (ev) => {
              ev.target.style.boxShadow = isDarkMode 
                ? '0 0 30px rgba(200,157,94,0.5), 0 0 60px rgba(200,157,94,0.25)' 
                : '0 0 30px rgba(200,157,94,0.6), 0 0 60px rgba(200,157,94,0.3)';
            },
            onMouseLeave: !editingLocation?.name?.trim() ? undefined : (ev) => {
              ev.target.style.boxShadow = isDarkMode 
                ? '0 0 20px rgba(200,157,94,0.3), 0 0 40px rgba(200,157,94,0.15)' 
                : '0 0 20px rgba(200,157,94,0.4), 0 0 40px rgba(200,157,94,0.2)';
            },
            title: !editingLocation?.name?.trim() ? 'Nimi on pakollinen' : 'Tallenna paikka'
        }, 'Tallenna')
        )
      )
    ),

    // ChapterSheet Modal
    showChapterSheet && editingChapter && e('div', {
      className: 'fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]',
      onClick: () => setShowChapterSheet(false),
      style: { animation: 'fadeIn 250ms ease-in-out' }
    },
      e('div', {
        className: `w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg ${
          isDarkMode ? 'bg-[#1A1815]' : 'bg-[#F8F2E8]'
        }`,
        onClick: (ev) => ev.stopPropagation(),
        style: { 
          boxShadow: isDarkMode 
            ? 'inset 0 0 16px rgba(0,0,0,0.2), 0 0 40px rgba(0,0,0,0.5)' 
            : 'inset 0 0 16px rgba(0,0,0,0.1), 0 0 40px rgba(0,0,0,0.2)' 
        }
      },
        // Header
        e('div', { 
          className: `p-4 flex items-center justify-between ${
            isDarkMode ? 'border-b border-[#715C38]' : 'border-b border-[#E6DED2]'
          }`
        },
          e('h3', { 
            className: 'text-lg font-bold',
            style: { 
              fontFamily: 'EB Garamond', 
              color: isDarkMode ? '#E9E4DA' : '#2B241C' 
            }
          }, `Luku ${editingChapter?.chapter}`),
          e('button', {
            onClick: () => setShowChapterSheet(false),
            className: `p-2 rounded transition-all ${
              isDarkMode ? 'hover:bg-[#715C38]' : 'hover:bg-[#E6DED2]'
            }`,
            style: { color: isDarkMode ? '#AFA699' : '#5E584D' }
          }, e(Icons.X))
        ),

        // Content
        e('div', { className: 'p-4 space-y-4' },
          e('div', null,
            e('label', { 
              className: 'text-xs block mb-1',
              style: { 
                fontFamily: 'IBM Plex Mono', 
                color: isDarkMode ? '#AFA699' : '#5E584D' 
              }
            }, 
              'Otsikko',
              e('span', { 
                className: 'ml-1',
                style: { color: isDarkMode ? '#C89D5E' : '#715C38' }
              }, '*')
            ),
            
            // Input + AI button container
            e('div', { className: 'flex gap-2 items-start' },
            e('input', {
              value: editingChapter?.title || '',
              onChange: (ev) => setEditingChapter({
                ...editingChapter,
                title: ev.target.value
              }),
                className: `flex-1 p-2 rounded border ${
                  isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                } ${
                  !editingChapter?.title?.trim() ? (isDarkMode ? 'border-[#9A7B4F]' : 'border-[#715C38]') : ''
                }`,
                style: { 
                  fontFamily: 'IBM Plex Mono', 
                  fontSize: '15px',
                  color: isDarkMode ? '#E9E4DA' : '#2B241C'
                },
                placeholder: 'Luvun otsikko (pakollinen)'
              }),
              
              // AI button
              e('button', {
                onClick: async () => {
                  try {
                    const prompt = `Ehdota kiinnostava ja osuvaotsikko luvulle ${editingChapter?.chapter} kirjasta. Anna vain otsikko, ei muuta tekstiä.`;
                    const result = await window.electronAPI.generateWithAI({
                      prompt,
                      model: 'claude-3-5-sonnet-20241022'
                    });
                    setEditingChapter({
                ...editingChapter,
                      title: result.trim()
                    });
                    console.log('✅ AI ehdotti otsikon:', result);
                  } catch (error) {
                    console.error('❌ AI-virhe:', error);
                  }
                },
                className: `px-3 py-2 rounded text-xs transition-all ${
                  isDarkMode 
                    ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                    : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
                }`,
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  fontWeight: '500'
                },
                title: 'Generoi otsikko AI:n avulla'
              }, '🜓 AI')
            ),
            
            !editingChapter?.title?.trim() && e('p', {
              className: 'text-xs mt-1',
              style: { 
                fontFamily: 'IBM Plex Mono',
                color: isDarkMode ? '#C89D5E' : '#715C38' 
              }
            }, 'Otsikko on pakollinen tieto')
        ),

        // Footer
          e('div', { className: 'flex gap-2 mt-4' },
          e('button', {
            onClick: () => setShowChapterSheet(false),
              className: `px-4 py-2 rounded text-sm transition-all ${
                isDarkMode ? 'bg-[#715C38] hover:bg-[#8C806C]' : 'bg-[#E6DED2] hover:bg-[#867C6B]'
              }`,
              style: { 
                fontFamily: 'IBM Plex Mono',
                color: isDarkMode ? '#E9E4DA' : '#2B241C'
              }
          }, 'Peruuta'),
          e('button', {
            onClick: () => {
                if (!editingChapter?.title?.trim()) {
                  console.warn('⚠️ Validointivirhe: Otsikko on pakollinen');
                  return;
                }
                
                // Tallenna luvun tiedot items-puuhun
                updateItem(editingChapter.id, {
                  title: editingChapter.title,
                  status: editingChapter.status,
                  label: editingChapter.label,
                  notes: editingChapter.notes
                });
                
              setShowChapterSheet(false);
                console.log('✅ Luku tallennettu:', editingChapter.title);
              },
              disabled: !editingChapter?.title?.trim(),
              className: `px-4 py-2 rounded text-sm transition-all ${
                !editingChapter?.title?.trim()
                  ? 'bg-[#8C806C] text-[#AFA699] cursor-not-allowed'
                  : isDarkMode 
                    ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                    : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
              }`,
              style: { 
                fontFamily: 'IBM Plex Mono',
                fontWeight: '500',
                boxShadow: !editingChapter?.title?.trim() ? 'none' : (isDarkMode 
                  ? '0 0 20px rgba(200,157,94,0.3), 0 0 40px rgba(200,157,94,0.15)' 
                  : '0 0 20px rgba(200,157,94,0.4), 0 0 40px rgba(200,157,94,0.2)'),
                transition: 'all 0.3s ease'
              },
              onMouseEnter: !editingChapter?.title?.trim() ? undefined : (ev) => {
                ev.target.style.boxShadow = isDarkMode 
                  ? '0 0 30px rgba(200,157,94,0.5), 0 0 60px rgba(200,157,94,0.25)' 
                  : '0 0 30px rgba(200,157,94,0.6), 0 0 60px rgba(200,157,94,0.3)';
              },
              onMouseLeave: !editingChapter?.title?.trim() ? undefined : (ev) => {
                ev.target.style.boxShadow = isDarkMode 
                  ? '0 0 20px rgba(200,157,94,0.3), 0 0 40px rgba(200,157,94,0.15)' 
                  : '0 0 20px rgba(200,157,94,0.4), 0 0 40px rgba(200,157,94,0.2)';
              },
              title: !editingChapter?.title?.trim() ? 'Otsikko on pakollinen' : 'Tallenna luku'
          }, 'Tallenna')
          )
        )
      )
    ),

    // ThreadSheet Modal
    showThreadSheet && editingThread && e('div', {
      className: 'fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]',
      onClick: () => setShowThreadSheet(false),
      style: { animation: 'fadeIn 250ms ease-in-out' }
    },
      e('div', {
        className: `w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg ${
          isDarkMode ? 'bg-[#1A1815]' : 'bg-[#F8F2E8]'
        }`,
        onClick: (ev) => ev.stopPropagation(),
        style: { 
          boxShadow: isDarkMode 
            ? 'inset 0 0 16px rgba(0,0,0,0.2), 0 0 40px rgba(0,0,0,0.5)' 
            : 'inset 0 0 16px rgba(0,0,0,0.1), 0 0 40px rgba(0,0,0,0.2)' 
        }
      },
        // Header
        e('div', { 
          className: `p-4 flex items-center justify-between ${
            isDarkMode ? 'border-b border-[#715C38]' : 'border-b border-[#E6DED2]'
          }`
        },
          e('h3', { 
            className: 'text-lg font-bold',
            style: { 
              fontFamily: 'EB Garamond', 
              color: isDarkMode ? '#E9E4DA' : '#2B241C' 
            }
          }, 'Juonenlanka'),
          e('button', {
            onClick: () => setShowThreadSheet(false),
            className: `p-2 rounded transition-all ${
              isDarkMode ? 'hover:bg-[#715C38]' : 'hover:bg-[#E6DED2]'
            }`,
            style: { color: isDarkMode ? '#AFA699' : '#5E584D' }
          }, e(Icons.X))
        ),

        // Content
        e('div', { className: 'p-4 space-y-4' },
          
          // PERUSTIEDOT
          e('div', { 
            className: `pb-4 ${isDarkMode ? 'border-b border-[#715C38]' : 'border-b border-[#E6DED2]'}`
          },
            e('h4', { 
              className: 'font-bold mb-3 text-sm',
              style: { 
                fontFamily: 'EB Garamond',
                color: isDarkMode ? '#E9E4DA' : '#2B241C'
              }
            }, 'PERUSTIEDOT'),
            
            // Nimi (pakollinen)
            e('div', { className: 'mb-3' },
              e('label', { 
                className: 'text-xs block mb-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 
                'Nimi',
                e('span', { 
                  className: 'ml-1',
                  style: { color: isDarkMode ? '#C89D5E' : '#715C38' }
                }, '*')
              ),
            e('input', {
                type: 'text',
              value: editingThread?.name || '',
              onChange: (ev) => setEditingThread({
                ...editingThread,
                name: ev.target.value
              }),
                className: `w-full p-2 rounded border ${
                  isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                } ${
                  !editingThread?.name?.trim() ? (isDarkMode ? 'border-[#9A7B4F]' : 'border-[#715C38]') : ''
                }`,
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '15px',
                  color: isDarkMode ? '#E9E4DA' : '#2B241C'
                },
                placeholder: 'Juonenlangan nimi (pakollinen)'
              }),
              !editingThread?.name?.trim() && e('p', {
                className: 'text-xs mt-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#C89D5E' : '#715C38'
                }
              }, 'Nimi on pakollinen tieto')
            ),
            
            // Tyyppi
            e('div', { className: 'mb-3' },
              e('label', { 
                className: 'text-xs block mb-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Tyyppi'),
              e('select', {
                value: editingThread?.type || 'Sivujuoni',
                onChange: (ev) => setEditingThread({
                  ...editingThread,
                  type: ev.target.value
                }),
                className: `w-full p-2 rounded border ${
                  isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                }`,
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '15px',
                  color: isDarkMode ? '#E9E4DA' : '#2B241C'
                }
              },
                e('option', { value: 'Pääjuoni' }, 'Pääjuoni'),
                e('option', { value: 'Sivujuoni' }, 'Sivujuoni'),
                e('option', { value: 'Teema' }, 'Teema'),
                e('option', { value: 'Hahmon kaari' }, 'Hahmon kaari')
              )
            ),
            
            // Kuvaus + AI button
          e('div', null,
              e('label', { 
                className: 'text-xs block mb-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Kuvaus'),
              e('div', { className: 'flex gap-2' },
            e('textarea', {
                  rows: 3,
              value: editingThread?.description || '',
              onChange: (ev) => setEditingThread({
                ...editingThread,
                description: ev.target.value
              }),
                  className: `flex-1 p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: 'Mitä tämä juonenlanka käsittelee?'
                }),
                e('button', {
                  onClick: async () => {
                    try {
                      const prompt = `Luo kiinnostava juonenkuvaus tyypille "${editingThread?.type || 'Sivujuoni'}" nimeltä "${editingThread?.name}". Anna vain kuvaus, 2-3 lausetta.`;
                      const result = await window.electronAPI.generateWithAI({
                        prompt,
                        model: 'claude-3-5-sonnet-20241022'
                      });
                      setEditingThread({
                        ...editingThread,
                        description: result.trim()
                      });
                      console.log('✅ AI loi juonikuvauksen');
                    } catch (error) {
                      console.error('❌ AI-virhe:', error);
                    }
                  },
                  className: `px-3 py-2 rounded text-xs transition-all self-start ${
                    isDarkMode 
                      ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                      : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
                  }`,
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    fontWeight: '500'
                  },
                  title: 'Generoi kuvaus AI:n avulla'
                }, '🜓 AI')
              )
            )
          ),
          
          // STATUS
          e('div', { 
            className: `pb-4 ${isDarkMode ? 'border-b border-[#715C38]' : 'border-b border-[#E6DED2]'}`
          },
            e('h4', { 
              className: 'font-bold mb-3 text-sm',
              style: { 
                fontFamily: 'EB Garamond',
                color: isDarkMode ? '#E9E4DA' : '#2B241C'
              }
            }, 'STATUS'),
            
            // Tila
            e('div', { className: 'mb-3' },
              e('label', { 
                className: 'text-xs block mb-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 'Tila'),
              e('select', {
                value: editingThread?.status || 'Kehittyy',
                onChange: (ev) => setEditingThread({
                  ...editingThread,
                  status: ev.target.value
                }),
                className: `w-full p-2 rounded border ${
                  isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                }`,
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  fontSize: '15px',
                  color: isDarkMode ? '#E9E4DA' : '#2B241C'
                }
              },
                e('option', { value: 'Avoin' }, 'Avoin - Ei vielä aloitettu'),
                e('option', { value: 'Kehittyy' }, 'Kehittyy - Käynnissä'),
                e('option', { value: 'Ratkaistu' }, 'Ratkaistu - Valmis')
              )
            ),
            
            // Progress (KULTAINEN!)
            e('div', null,
              e('label', { 
                className: 'text-xs block mb-1',
                style: { 
                  fontFamily: 'IBM Plex Mono',
                  color: isDarkMode ? '#AFA699' : '#5E584D'
                }
              }, 
                `Eteneminen: ${editingThread?.progress || 0}%`
              ),
              e('input', {
                type: 'range',
                min: 0,
                max: 100,
                step: 5,
                value: editingThread?.progress || 0,
                onChange: (ev) => setEditingThread({
                  ...editingThread,
                  progress: parseInt(ev.target.value, 10)
                }),
                className: 'w-full'
              }),
              e('div', { 
                className: 'w-full h-2 rounded mt-2',
                style: { 
                  backgroundColor: isDarkMode ? '#715C38' : '#E6DED2'
                }
              },
                e('div', {
                  className: 'h-2 rounded transition-all',
                  style: { 
                    width: `${editingThread?.progress || 0}%`,
                    background: isDarkMode 
                      ? 'linear-gradient(90deg, #9A7B4F 0%, #C89D5E 100%)'
                      : 'linear-gradient(90deg, #C89D5E 0%, #9A7B4F 100%)'
                  }
                })
              )
            )
          ),
          
          // TIMELINE
            e('div', null,
            e('h4', { 
              className: 'font-bold mb-3 text-sm',
              style: { 
                fontFamily: 'EB Garamond',
                color: isDarkMode ? '#E9E4DA' : '#2B241C'
              }
            }, 'TIMELINE'),
            
            e('div', { className: 'grid grid-cols-3 gap-3' },
              // Aloitusluku
              e('div', null,
                e('label', { 
                  className: 'text-xs block mb-1',
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    color: isDarkMode ? '#AFA699' : '#5E584D'
                  }
                }, 'Aloitusluku'),
              e('input', {
                type: 'number',
                  min: 0,
                  value: editingThread?.timeline?.start || '',
                onChange: (ev) => setEditingThread({
                  ...editingThread,
                    timeline: {
                      ...editingThread?.timeline,
                      start: parseInt(ev.target.value, 10) || 0
                    }
                  }),
                  className: `w-full p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: '1'
                })
              ),
              
              // Nykyinen vaihe
            e('div', null,
                e('label', { 
                  className: 'text-xs block mb-1',
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    color: isDarkMode ? '#AFA699' : '#5E584D'
                  }
                }, 'Nykyinen'),
              e('input', {
                type: 'number',
                  min: 0,
                  value: editingThread?.timeline?.current || '',
                onChange: (ev) => setEditingThread({
                  ...editingThread,
                    timeline: {
                      ...editingThread?.timeline,
                      current: parseInt(ev.target.value, 10) || 0
                    }
                  }),
                  className: `w-full p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: '5'
                })
              ),
              
              // Arvioitu ratkaisu
              e('div', null,
                e('label', { 
                  className: 'text-xs block mb-1',
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    color: isDarkMode ? '#AFA699' : '#5E584D'
                  }
                }, 'Ratkaisu'),
                e('input', {
                  type: 'number',
                  min: 0,
                  value: editingThread?.timeline?.end || '',
                  onChange: (ev) => setEditingThread({
                    ...editingThread,
                    timeline: {
                      ...editingThread?.timeline,
                      end: parseInt(ev.target.value, 10) || 0
                    }
                  }),
                  className: `w-full p-2 rounded border ${
                    isDarkMode ? 'bg-[#100F0D] border-[#715C38]' : 'bg-white border-[#E6DED2]'
                  }`,
                  style: { 
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '15px',
                    color: isDarkMode ? '#E9E4DA' : '#2B241C'
                  },
                  placeholder: '10'
                })
              )
            )
          )
        ),

        // Footer
        e('div', { 
          className: `p-4 flex gap-2 justify-end ${
            isDarkMode ? 'border-t border-[#715C38]' : 'border-t border-[#E6DED2]'
          }`
        },
          e('button', {
            onClick: () => setShowThreadSheet(false),
            className: `px-4 py-2 rounded text-sm transition-all ${
              isDarkMode ? 'bg-[#715C38] hover:bg-[#8C806C]' : 'bg-[#E6DED2] hover:bg-[#867C6B]'
            }`,
            style: { 
              fontFamily: 'IBM Plex Mono',
              color: isDarkMode ? '#E9E4DA' : '#2B241C'
            }
          }, 'Peruuta'),
          e('button', {
            onClick: () => {
              if (!editingThread?.name?.trim()) {
                console.warn('⚠️ Validointivirhe: Nimi on pakollinen');
                return;
              }
              
              setProject(prev => ({
                ...prev,
                story: {
                  ...prev.story,
                  threads: (prev.story.threads || []).map(t =>
                    t.id === editingThread.id ? editingThread : t
                  )
                }
              }));
              setShowThreadSheet(false);
              console.log('✅ Juonenlanka tallennettu:', editingThread.name);
            },
            disabled: !editingThread?.name?.trim(),
            className: `px-4 py-2 rounded text-sm transition-all ${
              !editingThread?.name?.trim()
                ? 'bg-[#8C806C] text-[#AFA699] cursor-not-allowed'
                : isDarkMode 
                  ? 'bg-[#9A7B4F] hover:bg-[#C89D5E] text-[#100F0D]' 
                  : 'bg-[#C89D5E] hover:bg-[#9A7B4F] text-white'
            }`,
            style: { 
              fontFamily: 'IBM Plex Mono',
              fontWeight: '500',
              boxShadow: !editingThread?.name?.trim() ? 'none' : (isDarkMode 
                ? '0 0 20px rgba(200,157,94,0.3), 0 0 40px rgba(200,157,94,0.15)' 
                : '0 0 20px rgba(200,157,94,0.4), 0 0 40px rgba(200,157,94,0.2)'),
              transition: 'all 0.3s ease'
            },
            onMouseEnter: !editingThread?.name?.trim() ? undefined : (ev) => {
              ev.target.style.boxShadow = isDarkMode 
                ? '0 0 30px rgba(200,157,94,0.5), 0 0 60px rgba(200,157,94,0.25)' 
                : '0 0 30px rgba(200,157,94,0.6), 0 0 60px rgba(200,157,94,0.3)';
            },
            onMouseLeave: !editingThread?.name?.trim() ? undefined : (ev) => {
              ev.target.style.boxShadow = isDarkMode 
                ? '0 0 20px rgba(200,157,94,0.3), 0 0 40px rgba(200,157,94,0.15)' 
                : '0 0 20px rgba(200,157,94,0.4), 0 0 40px rgba(200,157,94,0.2)';
            },
            title: !editingThread?.name?.trim() ? 'Nimi on pakollinen' : 'Tallenna juonenlanka'
          }, 'Tallenna')
        )
      )
    )
    
  ); // Close React.Fragment
  
  console.log('✅ JSX created:', result);
  console.log('   Type:', typeof result);
  console.log('   Is null?', result === null);
  console.log('   Is undefined?', result === undefined);
  
  return result;
}
// Error boundary for debugging
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, errorInfo) {
    console.error('React Error:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return React.createElement('div', { 
        style: { 
          padding: '20px', 
          color: 'white', 
          background: '#1e1e1e',
          fontFamily: 'monospace'
        } 
      },
        React.createElement('h1', null, 'Error in app'),
        React.createElement('pre', null, this.state.error?.toString()),
        React.createElement('pre', null, this.state.error?.stack)
      );
    }
    return this.props.children;
  }
}

console.log('🚀 Starting FAUST...');
console.log('React:', typeof React);
console.log('ReactDOM:', typeof ReactDOM);
console.log('Root element:', document.getElementById('root'));

try {
const root = ReactDOM.createRoot(document.getElementById('root'));
  console.log('✅ Root created');
  
  // Now test FaustEditor with error handling
root.render(React.createElement(ErrorBoundary, null, e(FaustEditor)));
  console.log('✅ FaustEditor render called');
  
  // Check DOM after render
  setTimeout(() => {
    const rootEl = document.getElementById('root');
    console.log('🔍 DOM after render:');
    console.log('  Children count:', rootEl?.childNodes?.length || 0);
    console.log('  First child:', rootEl?.firstChild);
    console.log('  innerHTML length:', rootEl?.innerHTML?.length || 0);
    if (rootEl?.innerHTML?.length < 100) {
      console.error('⚠️ WARNING: Very little content in DOM!');
      console.log('  Full innerHTML:', rootEl?.innerHTML);
    }
  }, 1000);
} catch (error) {
  console.error('❌ Fatal error:', error);
  document.body.innerHTML = `<div style="color: white; padding: 20px; font-family: monospace;">
    <h1>❌ Fatal Error</h1>
    <pre>${error.toString()}</pre>
    <pre>${error.stack}</pre>
  </div>`;
}

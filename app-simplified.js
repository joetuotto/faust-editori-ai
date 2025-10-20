const { useState, useRef, useEffect } = React;
const e = React.createElement;

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
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v2m0 0V7a2 2 0 00-2-2h-2m-4 0h-2' })
  ),
  Typewriter: () => e('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
    e('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' }),
    e('circle', { cx: 12, cy: 12, r: 2, stroke: 'currentColor', strokeWidth: 2, fill: 'none' })
  )
};

// macOS Native Styles
const MAC_OS_STYLES = `
  :root {
    /* macOS Native Colors - Dark Mode */
    --mac-bg-primary: #1e1e1e;
    --mac-bg-secondary: #2d2d2d;
    --mac-bg-tertiary: #3a3a3a;
    --mac-bg-quaternary: #464646;
    
    --mac-text-primary: #ffffff;
    --mac-text-secondary: rgba(255,255,255,0.65);
    --mac-text-tertiary: rgba(255,255,255,0.45);
    
    --mac-accent-blue: #0a84ff;
    --mac-accent-purple: #bf5af2;
    --mac-accent-green: #30d158;
    --mac-accent-red: #ff453a;
    --mac-accent-orange: #ff9f0a;
    
    /* Typography - SF Pro */
    --font-primary: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
    --font-mono: "SF Mono", Monaco, Menlo, monospace;
    
    /* Spacing (8px base) */
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
  
  /* Light Mode */
  [data-theme="light"] {
    --mac-bg-primary: #ffffff;
    --mac-bg-secondary: #f5f5f7;
    --mac-bg-tertiary: #e8e8ed;
    --mac-bg-quaternary: #d2d2d7;
    
    --mac-text-primary: #000000;
    --mac-text-secondary: rgba(0,0,0,0.65);
    --mac-text-tertiary: rgba(0,0,0,0.45);
    
    --mac-accent-blue: #007aff;
  }
  
  /* Base Styles */
  * {
    box-sizing: border-box;
  }
  
  body {
    font-family: var(--font-primary);
    background: var(--mac-bg-primary);
    color: var(--mac-text-primary);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  /* Smooth transitions */
  button, input, textarea, select {
    transition: background-color 0.15s var(--ease-in-out),
                color 0.15s var(--ease-in-out),
                border-color 0.15s var(--ease-in-out),
                box-shadow 0.15s var(--ease-in-out),
                transform 0.15s var(--ease-in-out);
  }
  
  /* Focus visible */
  *:focus-visible {
    outline: 2px solid var(--mac-accent-blue);
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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

SYMBOLINEN REDUNDANSSI: Toista keskeinen motiivi/symboli/kuva hienovaraisesti eri muodoissa läpi tekstin.

ESIMERKKI:
Motiivi: "Murtuminen"
- Rivi 1: "Lasi säröili ikkunassa"
- Rivi 45: "Hänen äänensä katkesi"
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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

PEAK-END RULE: Lukijat muistavat kaksi asiaa: 1) Intensiivisimmän hetken (peak), 2) Lopun (end).

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

PATHOS: Kosketa lukijan tunteisiin niin että hänen KEHONSA reagoi.

TEKNIIKAT:
1. **Bodily sensations**: "Kurkkua kuristaa", "Vatsa kiristyy"
2. **Universaalit tunteet**: Menetys, pelko, rakkaus, pettymys
3. **Henkilökohtainen + universaali**: "Hänen äitinsä" → jokainen muistaa omansa
4. **Konkreetti, ei abstrakti**: "Tyhjä tuoli" > "Yksinäisyys"

ESIMERKKI:
HEIKKO PATHOS: "Hän oli surullinen kun muisti äitiään."
VAHVA PATHOS: "Äidin tuoli oli tyhjä. Vain se peite, taitettu, niin kuin hän oli opettanut. Hänen kätensä värisivät kun hän kosketti sitä."

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
3. Lisää symbolinen kerros (luonto/säă/objekti)
4. Varmista että kerrokset keskustelevat keskenään

VASTAA SUOMEKSI.`
      },
      {
        id: 'unreliable_narrator',
        name: 'Epäluotettava kertoja',
        description: 'Lukija epäilee jokaista sanaa',
        prompt: `Luo EPÄLUOTETTAVA KERTOJA:

TEKSTI:
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
\${getActiveItem()?.content || '[Ei sisältöä]'}

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
${getActiveItem()?.content || '[Ei sisältöä]'}

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
${JSON.stringify(getSelectedLocation()?.facts || {}, null, 2)}

VISUAALISET ELEMENTIT:
${JSON.stringify(getSelectedLocation()?.visual || {}, null, 2)}

KIRJAN GENRE:
${GENRE_OPTIONS.find(g => g.id === project.genre)?.name || 'Psykologinen trilleri'}

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
${JSON.stringify(getSelectedLocation()?.facts || {}, null, 2)}

VISUAALISET ELEMENTIT:
${JSON.stringify(getSelectedLocation()?.visual || {}, null, 2)}

KIRJAN GENRE:
${GENRE_OPTIONS.find(g => g.id === project.genre)?.name || 'Psykologinen trilleri'}

TEHTÄVÄ:
Kirjoita 2-4 kappaletta paikka-kuvausta joka:

1. **Faktatarkka**: Käytä todellisia yksityiskohtia paikasta
2. **Aistillinen**: Aktivoi näkö, kuulo, haju, tunto (ja maku jos relevantti)
3. **Genrespesifi**: Sovita tunnelma genreen (${project.genre})
4. **Tyylillinen**: Käytä defamiliarisaatiota, rytmiä, konkretiaa
5. **Emotionaalinen**: Luo tunnelma joka tukee kohtausta

GENRE-OHJEET:
${getGenreGuidance(project.genre)}

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
${getActiveItem()?.content || '[Ei sisältöä]'}

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
${getActiveItem()?.content || '[Ei sisältöä]'}

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
${getActiveItem()?.content || '[Ei sisältöä]'}

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
${getActiveItem()?.content || '[Ei sisältöä]'}

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
${getActiveItem()?.content || '[Ei sisältöä]'}

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
${getActiveItem()?.content || '[Ei sisältöä]'}

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
    className: 'absolute z-50 animate-breatheIn',
    style: {
      top: position?.top || '50%',
      left: position?.left || '50%',
      transform: 'translate(-50%, -100%)',
      marginTop: '-8px'
    }
  },
    e('div', { className: 'relative' },
      // Arrow
// Simplified working version - gradual feature addition

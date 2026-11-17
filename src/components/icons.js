/**
 * src/components/icons.js - FAUST icon module (no dependency, no font, no emoji)
 * 17 sigils and 77 utility icons, drawn for FAUST on one grid.
 *
 * Drawing rules
 *   grid      24 x 24 units, 2-unit margin (live area 20 x 20), centred optically
 *   line      outline only: fill none, stroke currentColor, round caps, round joins
 *   weight    constant on screen whatever the size (vector-effect: non-scaling-stroke):
 *             1.25px up to 16px, 1.5px from 17 to 28px, 1.75px above
 *   sizes     12 (inline meta), 14 (rows, 11-12px buttons), 16 (default), 20 (dialog titles, sigil buttons), 40 (empty states)
 *   family    the main ring or triangle of every sigil is at least 11 units wide, its long axis 19 to 20 units,
 *             and no two parallel lines are closer than 2 units; status marks (phase0-3) are a smaller class (12 units)
 *   colour    inherited; a sigil is var(--accent-line) where it is the control or the title, and takes the row's
 *             icon colour in rows and trees; a utility icon has the colour of its label
 *   solid     only a "dot" that carries meaning (sol's centre, lunar phase) is filled; Icon({ filled: true })
 *             fills the stroked outline as well (the rating star when it is set)
 *
 * Use:  Icon({ name: 'close', size: 16 })   or   icons.close({ size: 16 })   or   icons.star({ size: 16, filled: true })
 * The script-tag components (Modals, ClaudeChat, AnnotationMargin) read window.FaustIcons.
 */
const { createElement: e } = React;

const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const rect = (x, y, w, h, rx = 0) => rx
  ? `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${rx} 0 0 1 ${rx} ${rx}v${h - 2 * rx}a${rx} ${rx} 0 0 1 ${-rx} ${rx}h${-(w - 2 * rx)}a${rx} ${rx} 0 0 1 ${-rx} ${-rx}v${-(h - 2 * rx)}a${rx} ${rx} 0 0 1 ${rx} ${-rx}z`
  : `M${x} ${y}h${w}v${h}h${-w}z`;
const dot = (x, y) => `M${x} ${y}h.01`;

// d = stroked path, f = filled path (no stroke), vb = own viewBox
export const SIGILS = {
  // FAUST's own AI verbs and story bodies. One sigil, one meaning.
  mercury:    { d: circle(12, 11.5, 5.5) + 'M7.5 2.5c0 2.2 2 3.5 4.5 3.5s4.5-1.3 4.5-3.5M12 17v5M9.5 19.5h5' }, // deep analysis (Scrutinium profundum), and nothing else
  alembic:    { d: circle(9.5, 15, 6) + 'M7 9.6V6.5a3 3 0 0 1 3-3h2l9.5 5.5' },               // quick check (Examen celeriter)
  sulfur:     { d: 'M12 2.5l7 10.5H5zM12 13v8.5M8.5 17.5h7' },                               // synopsis (Epitome brevis)
  stone:      { d: circle(12, 12, 10) + 'M12 2l8.66 15H3.34z' + circle(12, 12, 2.6) },        // generate (Magnum Opus), 14-28px; the inner ring sits on the triangle's incentre
  stoneFull:  { d: circle(12, 12, 10) + 'M12 2l8.66 15H3.34z' + rect(8, 9, 8, 8) + circle(12, 13, 2.6) }, // 32px and larger
  sol:        { d: circle(12, 12, 8.5), f: circle(12, 12, 1.6) },                             // character
  luna:       { d: 'M20.5 14A8.5 8.5 0 1 1 10 3.5a6.6 6.6 0 0 0 10.5 10.5z' },                 // timeline
  terra:      { d: circle(12, 15.5, 6.5) + 'M12 9V2M9 5.5h6' },                               // location
  lemniscate: { d: 'M12 12c-1.8-3-3.2-5-5-5a5 5 0 0 0 0 10c1.8 0 3.2-2 5-5zm0 0c1.8 3 3.2 5 5 5a5 5 0 0 0 0-10c-1.8 0-3.2 2-5 5z' }, // plot thread
  salt:       { d: circle(12, 12, 8.5) + 'M3.5 12h17' },                                      // story folder (corpus)
  trigon:     { d: 'M12 2.5l9.5 17.5h-19zM12 10.5l3.5 6.5h-7z' },                             // research folder (Tutkimuskansio): a triangle within a triangle
  hexagon:    { d: 'M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z' },                          // chapter (luku)
  star8:      { vb: '0 0 100 100', f: 'M50 2l8 29 26-15-15 26 29 8-29 8 15 26-26-15-8 29-8-29-26 15 15-26-29-8 29-8-15-26 26 15z' }, // the FAUST mark, and FAUST's own voice
  // chapter status as a lunar phase: plan, draft, revision, final. A smaller class than the
  // type sigils (ring of 12 units), so a status is never taken for a character or the story folder.
  phase0:     { d: circle(12, 12, 6) },
  phase1:     { d: circle(12, 12, 6), f: 'M12 12V6A6 6 0 0 1 18 12z' },
  phase2:     { d: circle(12, 12, 6), f: 'M12 6a6 6 0 0 1 0 12z' },
  phase3:     { d: circle(12, 12, 6), f: circle(12, 12, 3.5) }
};

export const GLYPHS = {
  // navigation and window
  close: { d: 'M6 6l12 12M18 6L6 18' },
  check: { d: 'M5 12.5l4.5 4.5L19 7.5' },
  checkAll: { d: 'M2.5 12.5l4 4L15 8M11.5 15.5l1 1 9-9' },
  plus: { d: 'M12 5v14M5 12h14' },
  minus: { d: 'M5 12h14' },
  chevronDown: { d: 'M6 9l6 6 6-6' },
  chevronUp: { d: 'M6 15l6-6 6 6' },
  chevronRight: { d: 'M9 6l6 6-6 6' },
  chevronLeft: { d: 'M15 6l-6 6 6 6' },
  arrowUp: { d: 'M12 19V5M6 11l6-6 6 6' },
  arrowDown: { d: 'M12 5v14M6 13l6 6 6-6' },
  arrowLeft: { d: 'M19 12H5M11 6l-6 6 6 6' },
  arrowRight: { d: 'M5 12h14M13 6l6 6-6 6' },
  more: { d: dot(5, 12) + dot(12, 12) + dot(19, 12) },
  grip: { d: dot(9, 6) + dot(15, 6) + dot(9, 12) + dot(15, 12) + dot(9, 18) + dot(15, 18) },
  panelLeft: { d: rect(3, 4, 18, 16, 2) + 'M9 4v16' },
  panelRight: { d: rect(3, 4, 18, 16, 2) + 'M15 4v16' },
  split: { d: rect(3, 4, 18, 16, 2) + 'M12 4v16' },
  cards: { d: rect(3, 4, 7.5, 7, 1.5) + rect(13.5, 4, 7.5, 7, 1.5) + rect(3, 14, 7.5, 6, 1.5) + rect(13.5, 14, 7.5, 6, 1.5) },
  focus: { d: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5' },
  settings: { d: 'M4 7h8M18 7h2M4 17h2M12 17h8' + circle(15, 7, 2.5) + circle(9, 17, 2.5) },
  search: { d: circle(11, 11, 6.5) + 'M16 16l4.5 4.5' },
  // files and project
  file: { d: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6' },
  folder: { d: 'M3 6h6l2 2.5h10V19H3z' },
  folderOpen: { d: 'M3 19V6h6l2 2.5h8V11M3 19l2.5-8h16L19 19z' },
  book: { d: 'M12 6.5C10 5 7 4.5 4 4.5v13c3 0 6 .5 8 2 2-1.5 5-2 8-2v-13c-3 0-6 .5-8 2zM12 6.5v13' },
  library: { d: 'M5 4v16M9.5 4v16M14 5.5l4.5 14M3 20h18' },
  save: { d: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6' },
  exportOut: { d: 'M12 15V4M7 9l5-5 5 5M5 20h14' },
  importIn: { d: 'M12 4v11M7 10l5 5 5-5M5 20h14' },
  snapshot: { d: 'M3 8h4l2-3h6l2 3h4v11H3z' + circle(12, 13, 3.5) },
  history: { d: 'M4 12a8 8 0 1 0 2.6-5.9M4 4.5V9h4.5M12 8v4.5l3 1.8' },
  undo: { d: 'M8 5L4 9l4 4M4 9h10a5 5 0 0 1 0 10H9' },
  redo: { d: 'M16 5l4 4-4 4M20 9H10a5 5 0 0 0 0 10h5' },
  refresh: { d: 'M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6M18 3v4h-4M6 21v-4h4' },
  compare: { d: rect(3, 5, 8, 14, 1.5) + rect(13, 5, 8, 14, 1.5) + 'M6 10h2M6 14h2M16 10h2M16 14h2' },
  copy: { d: rect(8, 8, 12, 12, 2) + 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3' },
  trash: { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5' },
  key: { d: circle(8, 15.5, 4) + 'M10.9 12.7L20 3.5M16 7.5l3 3M13.5 10l2 2' },
  link: { d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' },
  image: { d: rect(3, 4, 18, 16, 2) + circle(8.5, 9.5, 1.5) + 'M21 15l-5-5-9 10' },
  // manuscript tools
  bookmark: { d: 'M7 3h10v18l-5-4-5 4z' },
  bookmarkAdd: { d: 'M7 3h10v18l-5-4-5 4zM12 7v6M9 10h6' },
  quote: { d: 'M5 5v14M10 7h10M10 12h10M10 17h6' },
  list: { d: dot(4.5, 6) + dot(4.5, 12) + dot(4.5, 18) + 'M9 6h11M9 12h11M9 18h11' },
  listOrdered: { d: 'M4 5l1.5-1v4M4 11.5h2.5L4 14.5h2.5M10 6h10M10 13h10M10 19h10M4 18h2.5v3H4' },
  alignLeft: { d: 'M4 6h16M4 10h10M4 14h16M4 18h10' },
  alignCenter: { d: 'M4 6h16M7 10h10M4 14h16M7 18h10' },
  alignRight: { d: 'M4 6h16M10 10h10M4 14h16M10 18h10' },
  alignJustify: { d: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
  pen: { d: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3' },
  quill: { d: 'M5 19c1.5-9 6.5-14 15-15-1 8.5-6 13.5-15 15zM5 19l8-8' },
  note: { d: 'M5 4h14v10l-5 6H5zM19 14h-5v6' },
  comment: { d: 'M4 5h16v11H10l-5 4v-4H4z' },
  pin: { d: 'M12 21v-6M8 3h8l-1 6 3 3v3H6v-3l3-3z' },
  highlighter: { d: 'M14 3.5l6.5 6.5-8 8H8l-1.5-1.5V12zM7.5 17.5L5 20h4zM13 21h7.5' },
  target: { d: circle(12, 12, 9) + circle(12, 12, 5) + dot(12, 12) },
  typewriter: { d: rect(2, 6, 20, 12, 2) + dot(6, 10) + dot(10, 10) + dot(14, 10) + dot(18, 10) + 'M7 14h10' },
  clock: { d: circle(12, 12, 9) + 'M12 7v5l3 2' },
  eye: { d: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z' + circle(12, 12, 3) },
  globe: { d: circle(12, 12, 9) + 'M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18' },
  star: { d: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z' },
  // AI and voice (FAUST's own voice is the sigil star8, not a utility icon)
  idea: { d: 'M9 18h6M10 21h4M8.5 14.5a6 6 0 1 1 7 0c-.7.6-1 1.2-1 2h-5c0-.8-.3-1.4-1-2z' },
  mic: { d: rect(9, 3, 6, 11, 3) + 'M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21' },
  stop: { d: rect(6, 6, 12, 12, 1.5) },
  send: { d: 'M12 19V5M6 11l6-6 6 6' },
  insert: { d: 'M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4' },
  expand: { d: 'M12 3v6M9 6l3-3 3 3M12 21v-6M9 18l3 3 3-3M4 12h16' },
  scene: { d: rect(3, 9, 18, 11, 1.5) + 'M3 9l1.5-4.5h16.5V9M8.5 4.5l2 4.5M14 4.5l2 4.5' },
  cast: { d: circle(9, 8, 3.5) + 'M3 20a6 6 0 0 1 12 0M16.5 5a3.2 3.2 0 0 1 0 6.3M18 14.5a5 5 0 0 1 3 5.5' },
  place: { d: 'M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z' + circle(12, 9.5, 2.5) },
  arc: { d: 'M3 12h4l3-7 4 14 3-7h4' },
  conflict: { d: 'M13 3L5 13h6l-1 8 8-10h-6z' },
  // feedback
  info: { d: circle(12, 12, 9) + 'M12 11v5' + dot(12, 7.5) },
  warning: { d: 'M12 4l9 16H3zM12 10v4' + dot(12, 17) },
  error: { d: circle(12, 12, 9) + 'M9 9l6 6M15 9l-6 6' },
  success: { d: circle(12, 12, 9) + 'M8 12.5l3 3 5-6' }
};

const strokeFor = (size) => (size <= 16 ? 1.25 : size <= 28 ? 1.5 : 1.75);

export function Icon({ name, size = 16, title, className, style, filled }) {
  const def = SIGILS[name] || GLYPHS[name];
  if (!def) return null;
  const shape = { vectorEffect: 'non-scaling-stroke' };
  return e('svg', {
    className: 'faust-icon' + (className ? ' ' + className : ''),
    width: size, height: size, viewBox: def.vb || '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: strokeFor(size),
    strokeLinecap: 'round', strokeLinejoin: 'round',
    role: title ? 'img' : undefined, 'aria-label': title || undefined, 'aria-hidden': title ? undefined : 'true',
    focusable: 'false', style
  },
    def.d ? e('path', { d: def.d, ...shape, fill: filled ? 'currentColor' : undefined }) : null,
    def.f ? e('path', { d: def.f, fill: 'currentColor', stroke: 'none' }) : null
  );
}

// One function per icon: icons.close({ size: 14 }), icons.mercury({ size: 20 })
export const icons = Object.fromEntries(
  [...Object.keys(SIGILS), ...Object.keys(GLYPHS)].map(name => [name, (props) => Icon({ name, ...props })])
);

if (typeof window !== 'undefined') {
  window.FaustIcon = Icon;
  window.FaustIcons = icons;
}

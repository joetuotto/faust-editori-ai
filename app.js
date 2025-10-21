/**
 * FAUST - Simple Clean Implementation
 * Uses new faust-simple-layout.css
 */

const { createElement: e, useState, useEffect, useRef } = React;

function FAUSTApp() {
  // State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('faust-theme');
    return saved ? saved === 'NOX' : true;
  });
  const [showInspector, setShowInspector] = useState(false);
  const [content, setContent] = useState('');
  const [activeItem, setActiveItem] = useState({ title: 'Nimetön dokumentti', content: '', wordCount: 0 });

  const editorRef = useRef(null);

  // Apply theme
  useEffect(() => {
    const theme = isDarkMode ? 'NOX' : 'DEIS';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('faust-theme', theme);
    console.log(`[Theme] ${theme}`);
  }, [isDarkMode]);

  // Update word count
  useEffect(() => {
    const words = content.trim().split(/\s+/).filter(w => w.length > 0);
    setActiveItem(prev => ({ ...prev, content, wordCount: words.length }));
  }, [content]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd+I = Toggle Inspector
      if (e.metaKey && e.key === 'i') {
        e.preventDefault();
        setShowInspector(prev => !prev);
      }
      // Cmd+Shift+D = Toggle Theme
      if (e.metaKey && e.shiftKey && e.key === 'd') {
        e.preventDefault();
        setIsDarkMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return e('div', { className: 'faust-app' },
    // Header
    e('div', { className: 'faust-header' },
      e('div', { style: { padding: '16px', color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        e('span', { style: { fontFamily: 'EB Garamond', fontSize: '18px', fontWeight: 600 } }, 'FAUST'),
        e('div', { style: { display: 'flex', gap: '12px' } },
          e('button', {
            onClick: () => setIsDarkMode(prev => !prev),
            style: {
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text)',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px'
            }
          }, isDarkMode ? 'NOX' : 'DEIS'),
          e('button', {
            onClick: () => setShowInspector(prev => !prev),
            style: {
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text)',
              padding: '4px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono',
              fontSize: '12px'
            }
          }, showInspector ? 'Hide Inspector' : 'Show Inspector')
        )
      )
    ),

    // Main content - three columns
    e('div', { className: 'faust-main' },
      // Left sidebar
      e('div', { className: 'faust-sidebar' },
        e('div', { style: { padding: '16px', color: 'var(--text)' } },
          e('h3', { style: { fontFamily: 'EB Garamond', fontSize: '16px', marginBottom: '12px' } }, 'Projekti'),
          e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-2)' } },
            e('div', { style: { marginBottom: '8px' } }, '📁 Nimetön projekti'),
            e('div', { style: { marginLeft: '16px', marginBottom: '4px' } }, '📄 ' + activeItem.title),
            e('div', { style: { marginLeft: '16px', fontSize: '11px', color: 'var(--text-3)' } }, `${activeItem.wordCount} sanaa`)
          )
        )
      ),

      // Center editor
      e('div', { className: 'faust-editor' },
        e('div', { className: 'faust-editor-content' },
          // Title
          e('input', {
            value: activeItem.title,
            onChange: (ev) => setActiveItem(prev => ({ ...prev, title: ev.target.value })),
            placeholder: 'Dokumentin otsikko',
            style: {
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--ink)',
              fontFamily: 'EB Garamond',
              fontSize: '32px',
              fontWeight: 600,
              marginBottom: '8px',
              borderBottom: '2px solid transparent'
            }
          }),

          // Word count
          e('div', {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '13px',
              color: 'var(--text-3)',
              marginBottom: '24px'
            }
          }, `${activeItem.wordCount} sanaa`),

          // Textarea
          e('textarea', {
            ref: editorRef,
            className: 'faust-textarea',
            value: content,
            onChange: (ev) => setContent(ev.target.value),
            placeholder: 'Aloita kirjoittaminen...',
            style: {
              fontFamily: 'EB Garamond',
              fontSize: '18px',
              lineHeight: '1.8'
            }
          })
        )
      ),

      // Right inspector (hidden by default)
      e('div', { className: showInspector ? 'faust-inspector visible' : 'faust-inspector' },
        e('div', { style: { padding: '16px', color: 'var(--text)' } },
          e('h3', { style: { fontFamily: 'EB Garamond', fontSize: '16px', marginBottom: '12px' } }, 'Inspector'),
          e('div', { style: { fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-2)' } },
            e('div', { style: { marginBottom: '8px' } }, 'Metadata'),
            e('div', { style: { marginBottom: '8px' } }, 'Characters'),
            e('div', { style: { marginBottom: '8px' } }, 'AI Tools')
          )
        )
      )
    ),

    // Footer / Status bar
    e('div', { className: 'faust-footer' },
      e('div', {
        style: {
          padding: '4px 16px',
          color: 'var(--text-2)',
          fontSize: '12px',
          fontFamily: 'IBM Plex Mono',
          display: 'flex',
          justifyContent: 'space-between'
        }
      },
        e('span', null, activeItem.title),
        e('span', null, `${activeItem.wordCount} sanaa`)
      )
    )
  );
}

// Mount the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(e(FAUSTApp));

console.log('[FAUST] Simple app loaded ✨');

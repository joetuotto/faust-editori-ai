const { useState, useRef, useEffect } = React;
const e = React.createElement;

// Minimaalinen toimiva versio - lisätään ominaisuuksia vähitellen
function KirjoitusStudio() {
  const [text, setText] = useState('Ala kirjoittaa...');
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  return e(React.Fragment, null,
    // Styles
    e('style', { dangerouslySetInnerHTML: { __html: `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { 
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
        background: #1e1e1e;
        color: #ffffff;
      }
      .container { height: 100vh; display: flex; flex-direction: column; }
      .titlebar {
        height: 52px;
        background: #2d2d2d;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 20px;
      }
      .editor {
        flex: 1;
        padding: 72px;
        overflow-y: auto;
      }
      textarea {
        width: 100%;
        max-width: 800px;
        margin: 0 auto;
        display: block;
        background: transparent;
        border: none;
        outline: none;
        color: inherit;
        font-size: 17px;
        line-height: 1.6;
        font-family: inherit;
        resize: none;
        min-height: 500px;
      }
      .title {
        font-size: 18px;
        font-weight: 500;
      }
    `} }),
    
    // App UI
    e('div', { className: 'container' },
      // Titlebar
      e('div', { className: 'titlebar' },
        e('div', { className: 'title' }, '✨ Kirjoitusstudio - World-Class UX')
      ),
      
      // Editor
      e('div', { className: 'editor' },
        e('textarea', {
          value: text,
          onChange: (ev) => setText(ev.target.value),
          placeholder: 'Ala kirjoittaa...'
        })
      )
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(e(KirjoitusStudio));



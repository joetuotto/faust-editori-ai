const { useState } = React;
const e = React.createElement;

// Simple test component
const SimpleApp = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  return e('div', { style: { background: 'white', height: '100vh', padding: '20px' } },
    e('h1', { style: { color: 'black', fontSize: '24px', marginBottom: '20px' } }, '🎉 Kirjoitusstudio toimii!'),
    e('p', { style: { color: 'black', marginBottom: '20px' } }, 'React-komponentit latautuvat oikein.'),
    
    // AI Genius button
    e('button', {
      onClick: () => setIsOpen(true),
      style: {
        position: 'fixed',
        bottom: '32px',
        right: '32px',
        background: 'linear-gradient(to right, #9333ea, #6366f1)',
        color: 'white',
        padding: '16px',
        borderRadius: '50%',
        border: 'none',
        cursor: 'pointer',
        fontSize: '18px',
        fontWeight: 'bold',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 9999
      }
    }, '🧠 AI Genius'),
    
    // Dialog
    isOpen && e('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px'
      }
    },
      e('div', {
        style: {
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'auto'
        }
      },
        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
          e('h2', { style: { color: 'black', margin: 0 } }, '🧠 AI Story Architect'),
          e('button', {
            onClick: () => setIsOpen(false),
            style: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }
          }, '✕')
        ),
        e('p', { style: { color: 'black', marginBottom: '20px' } }, 'Tämä on yksinkertainen testiversio. Kirjoita tarinaideasi alapuolelle:'),
        e('textarea', {
          placeholder: 'Kuvaile tarinasi idea...',
          style: {
            width: '100%',
            height: '120px',
            padding: '12px',
            border: '2px solid #e5e7eb',
            borderRadius: '8px',
            fontSize: '16px',
            resize: 'vertical'
          }
        }),
        e('button', {
          style: {
            background: 'linear-gradient(to right, #9333ea, #6366f1)',
            color: 'white',
            padding: '12px 24px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: 'pointer',
            marginTop: '16px'
          }
        }, 'Lähetä idea')
      )
    )
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(e(SimpleApp));

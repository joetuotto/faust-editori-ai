const { useState } = React;
const e = React.createElement;

function TestApp() {
  const [count, setCount] = useState(0);
  
  return e('div', { 
    style: { 
      padding: '20px', 
      color: 'white', 
      background: '#1e1e1e',
      fontFamily: 'system-ui'
    } 
  },
    e('h1', null, 'React toimii! ✅'),
    e('p', null, `Count: ${count}`),
    e('button', {
      onClick: () => setCount(count + 1),
      style: {
        padding: '10px 20px',
        background: '#0a84ff',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer'
      }
    }, 'Click me')
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(e(TestApp));


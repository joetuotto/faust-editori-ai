import React, { createElement as e } from 'react';
import { createRoot } from 'react-dom/client';
import { StoryProvider } from './StoryManager';
import { ErrorBoundary } from './ErrorBoundary';
import { FaustEditor } from './UIComponents';
import { AIManager } from './AIManager';
import { FileManager } from './FileManager';
import './index.css'; // Assume

// Types
interface AppProps {}

// Main App
const App: React.FC<AppProps> = () => {
  return (
    <ErrorBoundary>
      <StoryProvider>
        <FaustEditor />
      </StoryProvider>
    </ErrorBoundary>
  );
};

// Render
const root = createRoot(document.getElementById('root')!);
root.render(e(App));

// Init managers
const aiManager = AIManager.create();
const fileManager = FileManager.create();

// Export for testing
export default App;



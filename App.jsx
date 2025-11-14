import React, { useState } from 'react';
import { useProject } from './hooks/useProject';
import { useAutoSave } from './hooks/useAutoSave';
import AIPanel from './components/Panels/AIPanel';
import ContinuityPanel from './components/Panels/ContinuityPanel';
import CharacterPanel from './components/Panels/CharacterPanel';
import ScenePanel from './components/Panels/ScenePanel';
import OutlinePanel from './components/Panels/OutlinePanel';
import QuillEditor from './components/Editor/QuillEditor';
import Sidebar from './components/Sidebar/Sidebar';
import './styles/app.css';

export default function App() {
  const { project, setProject, saveProject } = useProject();
  const [activePanel, setActivePanel] = useState('editor');
  const [activeItemId, setActiveItemId] = useState(null);
  
  useAutoSave(project, saveProject, 5000);

  const getActiveContent = () => {
    // Impl to get content from activeItemId
    return '';
  };

  const handleContentChange = (content) => {
    // Update project
  };

  const getActiveItem = () => {
    // Impl
    return null;
  };

  const updateContent = (newContent) => {
    // Update logic
  };

  return (
    <div className="app-container">
      <Sidebar 
        project={project}
        activeItemId={activeItemId}
        onItemSelect={setActiveItemId}
      />
      
      <div className="main-content">
        <QuillEditor 
          content={getActiveContent()}
          onChange={handleContentChange}
        />
      </div>
      
      <div className="panels-container">
        {activePanel === 'ai' && (
          <AIPanel 
            project={project}
            activeItem={getActiveItem()}
            onContentUpdate={updateContent}
          />
        )}
        {activePanel === 'continuity' && (
          <ContinuityPanel 
            project={project}
            onProjectUpdate={setProject}
          />
        )}
        {activePanel === 'characters' && <CharacterPanel project={project} />}
        {activePanel === 'scenes' && <ScenePanel project={project} />}
        {activePanel === 'outline' && <OutlinePanel project={project} />}
      </div>
    </div>
  );
}


















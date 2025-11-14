import React, { useState } from 'react';
import { callAI, callAIAPI } from '../../services/ai/AIManager';

export default function AIPanel({ project, activeItem, onContentUpdate }) {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');

  const handleGenerate = async () => {
    const result = await callAIAPI(prompt, true);
    setResponse(result.data);
  };

  return (
    <div className="ai-panel">
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Kysy AI:lta..." />
      <button onClick={handleGenerate}>Generoi</button>
      {response && <div className="ai-response">{response}</div>}
    </div>
  );
}


















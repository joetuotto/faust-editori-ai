import React from 'react'; // If needed

// Extracted AI constants
const AI_MODELS = {
  claude: 'claude-3-opus-20240229',
  grok: 'grok-beta',
  openai: 'gpt-4',
  gemini: 'gemini-pro',
  deepseek: 'deepseek-chat',
  cursor: 'cursor'
};

const callAI = async (model, prompt) => {
  let result;
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
      result = await window.electronAPI.deepseekAPI(prompt);
      break;
    default:
      result = await window.electronAPI.claudeAPI(prompt);
  }
  return result;
};

const callAIAPI = async (prompt, includeContext = true) => {
  // Full implementation from lines 2923-3062
  // ... (gather context, fullPrompt, try-catch, setAiResponse)
  try {
    const context = includeContext ? gatherContext() : '';
    const fullPrompt = `Olet luova kirjoitusavustaja... ${prompt}${context}`;
    const result = await callAI('claude', fullPrompt);
    if (result.success) {
      // Set response logic
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    // Error handling
  }
};

const gatherContext = () => {
  // From app.js
  return JSON.stringify({ outline: project.story?.outline || '' });
};

export { callAI, callAIAPI, AI_MODELS };



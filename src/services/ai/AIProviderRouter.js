/**
 * FAUST - Global AI Provider Router
 * Routes AI API calls to the correct provider backend via Electron IPC.
 */
(function(window) {
  'use strict';

  /**
   * Call AI API based on provider
   * @param {Object} params - { provider, prompt, model, temperature, max_tokens }
   * @returns {Promise<Object>} - API response
   */
  async function callAIProvider(params) {
    const { provider = 'anthropic', prompt, model, temperature = 0.7, max_tokens = 2000 } = params;

    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    const apiParams = {
      prompt,
      model,
      temperature,
      max_tokens
    };

    console.log(`[AI Provider] Calling ${provider} API with model: ${model || 'default'}`);

    switch (provider) {
      case 'anthropic':
        return await window.electronAPI.claudeAPI(apiParams);
      case 'openai':
        return await window.electronAPI.openaiAPI(apiParams);
      case 'grok':
        return await window.electronAPI.grokAPI(apiParams);
      case 'deepseek':
        return await window.electronAPI.deepseekAPI(apiParams);
      case 'gemini':
        return await window.electronAPI.geminiAPI(apiParams);
      case 'cursor':
        return await window.electronAPI.cursorAPI(apiParams);
      default:
        console.warn(`[AI Provider] Unknown provider: ${provider}, falling back to Anthropic`);
        return await window.electronAPI.claudeAPI(apiParams);
    }
  }

  window.callAIProvider = callAIProvider;
})(window);

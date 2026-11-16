/**
 * FAUST - Global AI Provider Router
 * Sends AI calls to the main process, which talks to Claude or to Cherry Studio.
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

    // One path for every call. The main process decides whether it goes to
    // Claude or to the model selected in Cherry Studio (Inspector → AI →
    // Tekoälyn lähde). `provider` is accepted for old project files and ignored.
    return await window.electronAPI.claudeAPI(apiParams);
  }

  window.callAIProvider = callAIProvider;
})(window);

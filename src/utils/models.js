/**
 * FAUST - AI model registry
 *
 * Single source of truth for default model IDs, used by both the Electron main
 * process (require) and the renderer (window.FAUST_MODELS).
 *
 * Saved projects may still reference models that providers have retired.
 * resolveModel() maps those to the current default so old projects keep working.
 * The live list of models a key can use is fetched via the `ai:list-models` IPC.
 */
(function (factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.FAUST_MODELS = api;
  }
})(function () {
  'use strict';

  const DEFAULT_MODELS = {
    anthropic: 'claude-opus-5',
    openai: 'gpt-5',
    grok: 'grok-4',
    gemini: 'gemini-2.5-pro',
    deepseek: 'deepseek-chat'
  };

  // Suggestions shown in the model picker before a live list has been fetched
  const SUGGESTED_MODELS = [
    { provider: 'anthropic', name: 'Claude Opus 5', model: 'claude-opus-5' },
    { provider: 'anthropic', name: 'Claude Sonnet 5', model: 'claude-sonnet-5' },
    { provider: 'anthropic', name: 'Claude Haiku 4.5', model: 'claude-haiku-4-5' },
    { provider: 'openai', name: 'GPT-5', model: 'gpt-5' },
    { provider: 'grok', name: 'Grok 4', model: 'grok-4' },
    { provider: 'gemini', name: 'Gemini 2.5 Pro', model: 'gemini-2.5-pro' },
    { provider: 'deepseek', name: 'DeepSeek', model: 'deepseek-chat' }
  ];

  // Model IDs that providers have shut down
  const RETIRED_PATTERNS = [
    /^claude-(instant|2)/,
    /^claude-3/,
    /^claude-(sonnet|opus)-4-2025/,
    /^gpt-3\.5/,
    /^gpt-4(-turbo)?(-preview)?$/,
    /^gpt-4-(0314|0613|1106|0125)/,
    /^gemini-(pro|1\.0|1\.5)/,
    /^grok-(beta|vision-beta|2)/,
    /^deepseek-coder$/,
    /^cursor-/
  ];

  function isRetired(model) {
    return !!model && RETIRED_PATTERNS.some(re => re.test(model));
  }

  function providerForModel(model) {
    if (!model) return null;
    if (model.startsWith('claude-')) return 'anthropic';
    if (/^(gpt-|o\d)/.test(model)) return 'openai';
    if (model.startsWith('grok-')) return 'grok';
    if (model.startsWith('gemini-')) return 'gemini';
    if (model.startsWith('deepseek-')) return 'deepseek';
    return null;
  }

  /**
   * Return a usable model ID for the provider: the requested one, unless it is
   * missing, retired, or belongs to another provider.
   */
  function resolveModel(provider, model) {
    const fallback = DEFAULT_MODELS[provider] || DEFAULT_MODELS.anthropic;
    if (!model || typeof model !== 'string') return fallback;
    if (isRetired(model)) return fallback;
    const owner = providerForModel(model);
    if (owner && owner !== provider) return fallback;
    return model;
  }

  /**
   * Current Claude models (Opus 4.7+, Sonnet 5, Fable) reject temperature/top_p/top_k.
   * Only older Claude models and Haiku still accept sampling parameters.
   */
  function acceptsSampling(provider, model) {
    if (provider !== 'anthropic') return true;
    return /^claude-(haiku|3)|^claude-(opus|sonnet)-4-(1|5|6)\b/.test(model || '');
  }

  /**
   * Current Claude models use adaptive thinking; budget_tokens is rejected.
   */
  function usesAdaptiveThinking(model) {
    return !/^claude-(haiku|3)|^claude-(opus|sonnet)-4-(1|5)\b/.test(model || '');
  }

  return {
    DEFAULT_MODELS,
    SUGGESTED_MODELS,
    isRetired,
    providerForModel,
    resolveModel,
    acceptsSampling,
    usesAdaptiveThinking
  };
});

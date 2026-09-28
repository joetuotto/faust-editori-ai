const {
  DEFAULT_MODELS,
  resolveModel,
  isRetired,
  acceptsSampling,
  usesAdaptiveThinking
} = require('../../src/utils/models');

describe('models registry', () => {
  test('retired models resolve to the provider default', () => {
    expect(resolveModel('anthropic', 'claude-3-5-sonnet-20241022')).toBe(DEFAULT_MODELS.anthropic);
    expect(resolveModel('anthropic', 'claude-sonnet-4-20250514')).toBe(DEFAULT_MODELS.anthropic);
    expect(resolveModel('openai', 'gpt-4-turbo-preview')).toBe(DEFAULT_MODELS.openai);
    expect(resolveModel('grok', 'grok-2-1212')).toBe(DEFAULT_MODELS.grok);
    expect(resolveModel('gemini', 'gemini-pro')).toBe(DEFAULT_MODELS.gemini);
  });

  test('current and unknown future models are kept', () => {
    expect(resolveModel('anthropic', 'claude-sonnet-5')).toBe('claude-sonnet-5');
    expect(resolveModel('openai', 'gpt-6')).toBe('gpt-6');
    expect(isRetired('claude-opus-5')).toBe(false);
  });

  test('missing or mismatched models fall back to the default', () => {
    expect(resolveModel('anthropic', '')).toBe(DEFAULT_MODELS.anthropic);
    expect(resolveModel('anthropic', 'gpt-5')).toBe(DEFAULT_MODELS.anthropic);
    expect(resolveModel('unknown', null)).toBe(DEFAULT_MODELS.anthropic);
  });

  test('sampling and thinking capabilities', () => {
    expect(acceptsSampling('anthropic', 'claude-opus-5')).toBe(false);
    expect(acceptsSampling('anthropic', 'claude-haiku-4-5')).toBe(true);
    expect(acceptsSampling('openai', 'gpt-5')).toBe(true);
    expect(usesAdaptiveThinking('claude-opus-5')).toBe(true);
    expect(usesAdaptiveThinking('claude-haiku-4-5')).toBe(false);
  });
});

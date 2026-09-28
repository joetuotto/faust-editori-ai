/**
 * AI model registry for the new app. (The legacy app keeps src/utils/models.js
 * until it is removed; keep the two in sync.)
 *
 * Saved projects may reference models a provider has retired; resolveModel()
 * maps those to the current default. The live model list for a key comes from
 * the provider (ai.listModels).
 */
import type { ProviderId } from './types';

export const PROVIDERS: { id: ProviderId; name: string; keyName: string }[] = [
  { id: 'anthropic', name: 'Anthropic (Claude)', keyName: 'ANTHROPIC_API_KEY' },
  { id: 'openai', name: 'OpenAI', keyName: 'OPENAI_API_KEY' },
  { id: 'gemini', name: 'Google Gemini', keyName: 'GOOGLE_API_KEY' },
  { id: 'grok', name: 'xAI Grok', keyName: 'GROK_API_KEY' },
  { id: 'deepseek', name: 'DeepSeek', keyName: 'DEEPSEEK_API_KEY' }
];

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5',
  grok: 'grok-4',
  gemini: 'gemini-2.5-pro',
  deepseek: 'deepseek-chat'
};

export const SUGGESTED_MODELS: { provider: ProviderId; name: string; model: string }[] = [
  { provider: 'anthropic', name: 'Claude Opus 5', model: 'claude-opus-5' },
  { provider: 'anthropic', name: 'Claude Sonnet 5', model: 'claude-sonnet-5' },
  { provider: 'anthropic', name: 'Claude Haiku 4.5', model: 'claude-haiku-4-5' },
  { provider: 'openai', name: 'GPT-5', model: 'gpt-5' },
  { provider: 'gemini', name: 'Gemini 2.5 Pro', model: 'gemini-2.5-pro' },
  { provider: 'grok', name: 'Grok 4', model: 'grok-4' },
  { provider: 'deepseek', name: 'DeepSeek', model: 'deepseek-chat' }
];

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

export function isRetired(model: string | undefined | null): boolean {
  return !!model && RETIRED_PATTERNS.some(re => re.test(model));
}

export function providerForModel(model: string | undefined | null): ProviderId | null {
  if (!model) return null;
  if (model.startsWith('claude-')) return 'anthropic';
  if (/^(gpt-|o\d)/.test(model)) return 'openai';
  if (model.startsWith('grok-')) return 'grok';
  if (model.startsWith('gemini-')) return 'gemini';
  if (model.startsWith('deepseek-')) return 'deepseek';
  return null;
}

export function resolveModel(provider: ProviderId, model?: string | null): string {
  const fallback = DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.anthropic;
  if (!model) return fallback;
  if (isRetired(model)) return fallback;
  const owner = providerForModel(model);
  if (owner && owner !== provider) return fallback;
  return model;
}

/** Current Claude models (Opus 4.7+, Sonnet 5, Fable) reject temperature/top_p/top_k */
export function acceptsSampling(provider: ProviderId, model: string): boolean {
  if (provider !== 'anthropic') return true;
  return /^claude-(haiku|3)|^claude-(opus|sonnet)-4-(1|5|6)\b/.test(model);
}

/** Current Claude models use adaptive thinking; budget_tokens is rejected */
export function usesAdaptiveThinking(model: string): boolean {
  return !/^claude-(haiku|3)|^claude-(opus|sonnet)-4-(1|5)\b/.test(model);
}

/** Models that support server-side refusal fallbacks */
export function supportsServerFallbacks(model: string): boolean {
  return /^claude-(opus-5|fable-5-1)/.test(model);
}

/**
 * AI model registry for the new app. (The legacy app keeps src/utils/models.js
 * until it is removed; keep the two in sync.)
 *
 * Saved projects may reference models a provider has retired; resolveModel()
 * maps those to the current default. The live model list for a key comes from
 * the provider (ai.listModels).
 */
import type { ProviderId, TokenUsage } from './types';

/**
 * `keyName` is the environment variable / stored-key name. For the local
 * Ollama server the stored "key" is its address, and no secret is needed.
 */
export const PROVIDERS: { id: ProviderId; name: string; keyName: string; local?: boolean }[] = [
  { id: 'anthropic', name: 'Anthropic (Claude)', keyName: 'ANTHROPIC_API_KEY' },
  { id: 'openai', name: 'OpenAI', keyName: 'OPENAI_API_KEY' },
  { id: 'gemini', name: 'Google Gemini', keyName: 'GOOGLE_API_KEY' },
  { id: 'grok', name: 'xAI Grok', keyName: 'GROK_API_KEY' },
  { id: 'deepseek', name: 'DeepSeek', keyName: 'DEEPSEEK_API_KEY' },
  { id: 'ollama', name: 'Ollama (paikallinen)', keyName: 'OLLAMA_HOST', local: true }
];

export const OLLAMA_DEFAULT_URL = 'http://localhost:11434';

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5',
  grok: 'grok-4',
  gemini: 'gemini-2.5-pro',
  deepseek: 'deepseek-chat',
  ollama: 'gemma3'
};

export const SUGGESTED_MODELS: { provider: ProviderId; name: string; model: string }[] = [
  { provider: 'anthropic', name: 'Claude Opus 5', model: 'claude-opus-5' },
  { provider: 'anthropic', name: 'Claude Sonnet 5', model: 'claude-sonnet-5' },
  { provider: 'anthropic', name: 'Claude Haiku 4.5', model: 'claude-haiku-4-5' },
  { provider: 'openai', name: 'GPT-5', model: 'gpt-5' },
  { provider: 'gemini', name: 'Gemini 2.5 Pro', model: 'gemini-2.5-pro' },
  { provider: 'grok', name: 'Grok 4', model: 'grok-4' },
  { provider: 'deepseek', name: 'DeepSeek', model: 'deepseek-chat' },
  { provider: 'ollama', name: 'Gemma 3', model: 'gemma3' },
  { provider: 'ollama', name: 'Qwen 3', model: 'qwen3' },
  { provider: 'ollama', name: 'Llama 3.3', model: 'llama3.3' }
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
  // Local models are whatever the writer has pulled; names may look like anything
  if (provider === 'ollama') return model;
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

/**
 * Project lookups as tools. Local models vary too much in tool support, so
 * they get the full context in the prompt instead.
 */
export function supportsTools(provider: ProviderId): boolean {
  return provider !== 'ollama';
}

/* ---------- cost ---------- */

/** USD per million tokens */
export interface ModelPrice {
  input: number;
  output: number;
}

/**
 * Approximate list prices, used only for the cost estimate. Providers change
 * prices; the writer can override any model in Settings. Unknown models show
 * tokens without a price.
 */
const LIST_PRICES: [RegExp, ModelPrice][] = [
  [/^claude-opus-4-[01]\b/, { input: 15, output: 75 }],
  [/^claude-opus/, { input: 5, output: 25 }],
  [/^claude-sonnet/, { input: 3, output: 15 }],
  [/^claude-haiku-4/, { input: 1, output: 5 }],
  [/^gpt-5-nano/, { input: 0.05, output: 0.4 }],
  [/^gpt-5-mini/, { input: 0.25, output: 2 }],
  [/^gpt-5/, { input: 1.25, output: 10 }],
  [/^gemini-2\.5-flash-lite/, { input: 0.1, output: 0.4 }],
  [/^gemini-2\.5-flash/, { input: 0.3, output: 2.5 }],
  [/^gemini-2\.5-pro/, { input: 1.25, output: 10 }],
  [/^grok-4/, { input: 3, output: 15 }],
  [/^deepseek/, { input: 0.28, output: 0.42 }]
];

export function priceFor(provider: ProviderId, model: string, overrides: Record<string, ModelPrice> = {}): ModelPrice | null {
  if (overrides[model]) return overrides[model];
  if (provider === 'ollama') return { input: 0, output: 0 };
  return LIST_PRICES.find(([re]) => re.test(model))?.[1] ?? null;
}

/** Estimated cost in USD; cache reads cost 10 % and cache writes 125 % of the input price */
export function estimateCost(price: ModelPrice | null, usage: TokenUsage): number | null {
  if (!price) return null;
  const input = (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) * 0.1 + (usage.cacheWriteTokens ?? 0) * 1.25;
  return (input * price.input + (usage.outputTokens ?? 0) * price.output) / 1_000_000;
}

export function formatCost(usd: number | null): string {
  if (usd === null) return '–';
  if (usd === 0) return '0 $';
  return usd < 0.01 ? '< 0,01 $' : `${usd.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

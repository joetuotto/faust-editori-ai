/**
 * One interface for all AI providers. Runs in the main process only, so API
 * keys never reach the renderer. Every call streams; `onText` receives the
 * text as it arrives and the promise resolves with the full result.
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import type { AIRequest, AIResult, ModelInfo, ProviderId } from '../shared/types';
import { acceptsSampling, resolveModel, supportsServerFallbacks, usesAdaptiveThinking } from '../shared/models';
import { getKey, keyName } from './keys';

export interface StreamOptions {
  signal?: AbortSignal;
  onText?: (text: string) => void;
  /** Ask the model to reason before answering (analysis tasks) */
  think?: boolean;
}

const OPENAI_COMPATIBLE: Partial<Record<ProviderId, string>> = {
  grok: 'https://api.x.ai/v1',
  deepseek: 'https://api.deepseek.com'
};

function missingKey(provider: ProviderId): AIResult {
  return {
    success: false,
    error: `${keyName(provider)} puuttuu. Lisää avain Asetuksissa.`
  };
}

async function streamAnthropic(apiKey: string, req: AIRequest, model: string, opts: StreamOptions): Promise<AIResult> {
  const client = new Anthropic({ apiKey });
  const params: Anthropic.Beta.MessageCreateParamsStreaming = {
    model,
    max_tokens: req.maxTokens ?? 16000,
    messages: req.messages,
    // Caches the stable prefix (system prompt with project context) across turns
    cache_control: { type: 'ephemeral' },
    stream: true
  };
  if (req.system) params.system = req.system;
  if (req.jsonSchema || req.effort) {
    params.output_config = {
      ...(req.jsonSchema ? { format: { type: 'json_schema' as const, schema: req.jsonSchema } } : {}),
      ...(req.effort && usesAdaptiveThinking(model) ? { effort: req.effort } : {})
    };
  }
  if (opts.think) {
    params.thinking = usesAdaptiveThinking(model)
      ? { type: 'adaptive' }
      : { type: 'enabled', budget_tokens: Math.min(8000, params.max_tokens - 1) };
  } else if (acceptsSampling('anthropic', model) && req.temperature !== undefined) {
    params.temperature = req.temperature;
  }
  if (supportsServerFallbacks(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  const stream = client.beta.messages.stream(params, { signal: opts.signal });
  stream.on('text', text => opts.onText?.(text));
  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    const category = message.stop_details?.category;
    return { success: false, error: `Malli kieltäytyi vastaamasta${category ? ` (${category})` : ''}.`, model: message.model };
  }
  return {
    success: true,
    text: message.content.filter(b => b.type === 'text').map(b => b.text).join(''),
    model: message.model,
    usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens }
  };
}

async function streamOpenAI(
  apiKey: string,
  baseURL: string | undefined,
  req: AIRequest,
  model: string,
  opts: StreamOptions
): Promise<AIResult> {
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
    ...req.messages
  ];
  const stream = await client.chat.completions.create(
    {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(req.jsonSchema
        ? baseURL?.includes('deepseek')
          ? { response_format: { type: 'json_object' as const } }
          : { response_format: { type: 'json_schema' as const, json_schema: { name: 'result', schema: req.jsonSchema, strict: true } } }
        : {}),
      ...(baseURL
        ? { max_tokens: req.maxTokens ?? 8000, ...(req.temperature !== undefined ? { temperature: req.temperature } : {}) }
        : { max_completion_tokens: req.maxTokens ?? 16000 })
    },
    { signal: opts.signal }
  );

  let text = '';
  let usage: AIResult['usage'];
  let served = model;
  for await (const chunk of stream) {
    served = chunk.model || served;
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      text += delta;
      opts.onText?.(delta);
    }
    if (chunk.usage) usage = { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
  }
  return { success: true, text, model: served, usage };
}

async function streamGemini(apiKey: string, req: AIRequest, model: string, opts: StreamOptions): Promise<AIResult> {
  const client = new GoogleGenAI({ apiKey });
  const stream = await client.models.generateContentStream({
    model,
    contents: req.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    config: {
      ...(req.system ? { systemInstruction: req.system } : {}),
      ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: req.jsonSchema } : {}),
      abortSignal: opts.signal
    }
  });

  let text = '';
  let usage: AIResult['usage'];
  for await (const chunk of stream) {
    const delta = chunk.text;
    if (delta) {
      text += delta;
      opts.onText?.(delta);
    }
    if (chunk.usageMetadata) {
      usage = { inputTokens: chunk.usageMetadata.promptTokenCount, outputTokens: chunk.usageMetadata.candidatesTokenCount };
    }
  }
  return { success: true, text, model, usage };
}

export async function generate(req: AIRequest, opts: StreamOptions = {}): Promise<AIResult> {
  const provider = req.provider ?? 'anthropic';
  const model = resolveModel(provider, req.model);
  const apiKey = await getKey(provider);
  if (!apiKey) return missingKey(provider);

  try {
    switch (provider) {
      case 'anthropic':
        return await streamAnthropic(apiKey, req, model, opts);
      case 'openai':
        return await streamOpenAI(apiKey, undefined, req, model, opts);
      case 'grok':
      case 'deepseek':
        return await streamOpenAI(apiKey, OPENAI_COMPATIBLE[provider], req, model, opts);
      case 'gemini':
        return await streamGemini(apiKey, req, model, opts);
      default:
        return { success: false, error: `Tuntematon palveluntarjoaja: ${provider}` };
    }
  } catch (error) {
    if (opts.signal?.aborted) return { success: false, error: 'Keskeytetty.' };
    return { success: false, error: (error as Error).message, model };
  }
}

/** Models available for the stored key, straight from the provider */
export async function listModels(provider: ProviderId): Promise<{ success: boolean; models?: ModelInfo[]; error?: string }> {
  const apiKey = await getKey(provider);
  if (!apiKey) return { success: false, error: missingKey(provider).error };

  try {
    if (provider === 'anthropic') {
      const models: ModelInfo[] = [];
      for await (const m of new Anthropic({ apiKey }).models.list()) {
        models.push({ id: m.id, name: m.display_name || m.id });
      }
      return { success: true, models };
    }
    if (provider === 'gemini') {
      const models: ModelInfo[] = [];
      for await (const m of await new GoogleGenAI({ apiKey }).models.list()) {
        if (!m.name || !(m.supportedActions ?? []).includes('generateContent')) continue;
        models.push({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name });
      }
      return { success: true, models };
    }
    const client = new OpenAI({ apiKey, ...(OPENAI_COMPATIBLE[provider] ? { baseURL: OPENAI_COMPATIBLE[provider] } : {}) });
    const models: ModelInfo[] = [];
    for await (const m of client.models.list()) models.push({ id: m.id, name: m.id });
    return { success: true, models: models.sort((a, b) => a.id.localeCompare(b.id)) };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

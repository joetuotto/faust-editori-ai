/**
 * One interface for all AI providers. Runs in the main process only, so API
 * keys never reach the renderer. Every call streams; `onText` receives the
 * text as it arrives and the promise resolves with the full result.
 *
 * With `tools`, the model may call read-only project lookups; the loop runs
 * here until the model answers (at most MAX_TOOL_ROUNDS rounds).
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenAI, type Content, type FunctionCall, type Part } from '@google/genai';
import type { AIRequest, AIResult, ModelInfo, ProviderId, TokenUsage } from '../shared/types';
import { OLLAMA_DEFAULT_URL, acceptsSampling, resolveModel, supportsServerFallbacks, supportsTools, usesAdaptiveThinking } from '../shared/models';
import { getKey, keyName } from './keys';
import type { ToolRunner } from './aiTools';

export interface StreamOptions {
  signal?: AbortSignal;
  onText?: (text: string) => void;
  /** Ask the model to reason before answering (analysis tasks) */
  think?: boolean;
  /** Project lookups, used when the request asks for tools */
  tools?: ToolRunner;
  /** Called with a short label each time the model looks something up */
  onTool?: (label: string) => void;
}

const MAX_TOOL_ROUNDS = 8;

function addTokens(total: TokenUsage, more: TokenUsage): TokenUsage {
  const sum = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));
  return {
    inputTokens: sum(total.inputTokens, more.inputTokens),
    outputTokens: sum(total.outputTokens, more.outputTokens),
    cacheReadTokens: sum(total.cacheReadTokens, more.cacheReadTokens),
    cacheWriteTokens: sum(total.cacheWriteTokens, more.cacheWriteTokens)
  };
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
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
    messages: [],
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

  if (opts.tools) {
    params.tools = opts.tools.defs.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema }));
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [...req.messages];
  const lookups: string[] = [];
  let usage: TokenUsage = {};
  let text = '';
  for (let round = 0; ; round++) {
    const stream = client.beta.messages.stream({ ...params, messages }, { signal: opts.signal });
    stream.on('text', delta => opts.onText?.(delta));
    const message = await stream.finalMessage();
    usage = addTokens(usage, {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0
    });

    if (message.stop_reason === 'refusal') {
      const category = message.stop_details?.category;
      return { success: false, error: `Malli kieltäytyi vastaamasta${category ? ` (${category})` : ''}.`, model: message.model, usage };
    }
    text += message.content.filter(b => b.type === 'text').map(b => b.text).join('');

    const calls = message.content.filter(b => b.type === 'tool_use');
    if (message.stop_reason !== 'tool_use' || calls.length === 0 || !opts.tools || round >= MAX_TOOL_ROUNDS) {
      return { success: true, text, model: message.model, usage, ...(lookups.length ? { lookups } : {}) };
    }
    // The assistant turn goes back unchanged (thinking blocks included)
    messages.push({ role: 'assistant', content: message.content as unknown as Anthropic.Beta.BetaContentBlockParam[] });
    messages.push({
      role: 'user',
      content: calls.map(call => {
        const { output, label } = opts.tools!.run(call.name, call.input as Record<string, unknown>);
        lookups.push(label);
        opts.onTool?.(label);
        return { type: 'tool_result' as const, tool_use_id: call.id, content: output };
      })
    });
    if (text && !text.endsWith('\n')) {
      text += '\n\n';
      opts.onText?.('\n\n');
    }
  }
}

async function streamOpenAI(
  apiKey: string,
  baseURL: string | undefined,
  req: AIRequest,
  model: string,
  opts: StreamOptions
): Promise<AIResult> {
  // A local server that is not running should fail at once, not after retries
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}), ...(apiKey === 'ollama' ? { maxRetries: 0 } : {}) });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...(req.system ? [{ role: 'system' as const, content: req.system }] : []),
    ...req.messages
  ];
  const tools: OpenAI.Chat.ChatCompletionTool[] | undefined = opts.tools?.defs.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters }
  }));

  let text = '';
  let usage: TokenUsage = {};
  let served = model;
  const lookups: string[] = [];
  for (let round = 0; ; round++) {
    const stream = await client.chat.completions.create(
      {
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(tools && round < MAX_TOOL_ROUNDS ? { tools } : {}),
        ...(req.jsonSchema
          ? baseURL && !baseURL.includes('x.ai')
            ? { response_format: { type: 'json_object' as const } }
            : { response_format: { type: 'json_schema' as const, json_schema: { name: 'result', schema: req.jsonSchema, strict: true } } }
          : {}),
        ...(baseURL
          ? { max_tokens: req.maxTokens ?? 8000, ...(req.temperature !== undefined ? { temperature: req.temperature } : {}) }
          : { max_completion_tokens: req.maxTokens ?? 16000 })
      },
      { signal: opts.signal }
    );

    let roundText = '';
    let finish: string | null = null;
    const calls: { id: string; name: string; args: string }[] = [];
    for await (const chunk of stream) {
      served = chunk.model || served;
      const choice = chunk.choices[0];
      const delta = choice?.delta?.content;
      if (delta) {
        roundText += delta;
        opts.onText?.(delta);
      }
      for (const tc of choice?.delta?.tool_calls ?? []) {
        const call = (calls[tc.index] ??= { id: '', name: '', args: '' });
        if (tc.id) call.id = tc.id;
        if (tc.function?.name) call.name += tc.function.name;
        if (tc.function?.arguments) call.args += tc.function.arguments;
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (chunk.usage) usage = addTokens(usage, { inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens });
    }
    text += roundText;

    const pending = calls.filter(Boolean);
    if (finish !== 'tool_calls' || pending.length === 0 || !opts.tools) {
      return { success: true, text, model: served, usage, ...(lookups.length ? { lookups } : {}) };
    }
    messages.push({
      role: 'assistant',
      content: roundText || null,
      tool_calls: pending.map(c => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.args || '{}' } }))
    });
    for (const call of pending) {
      const { output, label } = opts.tools.run(call.name, parseArgs(call.args));
      lookups.push(label);
      opts.onTool?.(label);
      messages.push({ role: 'tool', tool_call_id: call.id, content: output });
    }
    if (text && !text.endsWith('\n')) {
      text += '\n\n';
      opts.onText?.('\n\n');
    }
  }
}

async function streamGemini(apiKey: string, req: AIRequest, model: string, opts: StreamOptions): Promise<AIResult> {
  const client = new GoogleGenAI({ apiKey });
  const contents: Content[] = req.messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const tools = opts.tools
    ? [{ functionDeclarations: opts.tools.defs.map(t => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }]
    : undefined;

  let text = '';
  let usage: TokenUsage = {};
  const lookups: string[] = [];
  for (let round = 0; ; round++) {
    const stream = await client.models.generateContentStream({
      model,
      contents,
      config: {
        ...(req.system ? { systemInstruction: req.system } : {}),
        ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: req.jsonSchema } : {}),
        ...(tools && round < MAX_TOOL_ROUNDS ? { tools } : {}),
        abortSignal: opts.signal
      }
    });

    // Model parts are sent back as-is: they carry the thought signatures tool calls need
    const modelParts: Part[] = [];
    const calls: FunctionCall[] = [];
    let roundUsage: TokenUsage = {};
    for await (const chunk of stream) {
      const delta = chunk.text;
      if (delta) {
        text += delta;
        opts.onText?.(delta);
      }
      modelParts.push(...(chunk.candidates?.[0]?.content?.parts ?? []));
      calls.push(...(chunk.functionCalls ?? []));
      if (chunk.usageMetadata) {
        roundUsage = { inputTokens: chunk.usageMetadata.promptTokenCount, outputTokens: chunk.usageMetadata.candidatesTokenCount };
      }
    }
    usage = addTokens(usage, roundUsage);

    if (calls.length === 0 || !opts.tools) return { success: true, text, model, usage, ...(lookups.length ? { lookups } : {}) };
    contents.push({ role: 'model', parts: modelParts });
    contents.push({
      role: 'user',
      parts: calls.map(call => {
        const { output, label } = opts.tools!.run(call.name ?? '', (call.args ?? {}) as Record<string, unknown>);
        lookups.push(label);
        opts.onTool?.(label);
        return { functionResponse: { id: call.id, name: call.name, response: { result: output } } };
      })
    });
    if (text && !text.endsWith('\n')) {
      text += '\n\n';
      opts.onText?.('\n\n');
    }
  }
}

/** Base URL of the local Ollama server's OpenAI-compatible API */
async function ollamaBase(): Promise<string> {
  const stored = (await getKey('ollama')) || OLLAMA_DEFAULT_URL;
  const url = /^https?:\/\//.test(stored) ? stored : `http://${stored}`;
  return `${url.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`;
}

export async function generate(req: AIRequest, opts: StreamOptions = {}): Promise<AIResult> {
  const provider = req.provider ?? 'anthropic';
  const model = resolveModel(provider, req.model);
  if (!req.tools || !supportsTools(provider)) opts = { ...opts, tools: undefined };

  if (provider === 'ollama') {
    try {
      return await streamOpenAI('ollama', await ollamaBase(), req, model, opts);
    } catch (error) {
      if (opts.signal?.aborted) return { success: false, error: 'Keskeytetty.' };
      const message = (error as Error).message;
      return {
        success: false,
        error: /ECONNREFUSED|fetch failed|Connection error/i.test(message)
          ? `Ollama ei vastaa osoitteessa ${await ollamaBase()}. Käynnistä Ollama (ollama serve) tai tarkista osoite Asetuksissa.`
          : message,
        model
      };
    }
  }

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
  if (provider === 'ollama') {
    try {
      const client = new OpenAI({ apiKey: 'ollama', baseURL: await ollamaBase() });
      const models: ModelInfo[] = [];
      for await (const m of client.models.list()) models.push({ id: m.id, name: m.id });
      if (models.length === 0) return { success: false, error: 'Ollamassa ei ole malleja. Lataa malli, esim. ollama pull gemma3' };
      return { success: true, models: models.sort((a, b) => a.id.localeCompare(b.id)) };
    } catch {
      return { success: false, error: `Ollama ei vastaa osoitteessa ${await ollamaBase()}.` };
    }
  }
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

/** Helpers for one-off AI requests from the renderer */
import type { AIRequest, ProviderId } from '../../../shared/types';
import { resolveModel } from '../../../shared/models';
import { useStore } from '../store';

export function currentModel(): { provider: ProviderId; model: string } {
  const ai = useStore.getState().project?.manifest.ai;
  const provider = ai?.provider ?? 'anthropic';
  return { provider, model: resolveModel(provider, ai?.models[provider]) };
}

/** Pull the first JSON object out of a model answer (handles code fences and chatter) */
export function extractJSON(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Vastauksessa ei ollut JSON-dataa.');
  return JSON.parse(text.slice(start, end + 1));
}

export type JSONResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Ask for structured JSON. Providers with native structured output get the
 * schema directly; it is also described in the prompt for the others.
 */
export async function generateJSON<T>(
  request: Omit<AIRequest, 'provider' | 'model' | 'jsonSchema'> & { schema: Record<string, unknown> },
  onCall?: (id: string) => void
): Promise<JSONResult<T>> {
  const { schema, ...rest } = request;
  const system = `${rest.system ?? ''}\n\nVastaa pelkkänä JSON-objektina, joka noudattaa tätä JSON Schemaa:\n${JSON.stringify(schema)}`.trim();
  const call = window.faust.ai.generate({ ...currentModel(), ...rest, system, jsonSchema: schema });
  onCall?.(call.id);
  const result = await call.result;
  if (!result.success) return { ok: false, error: result.error ?? 'AI-kutsu epäonnistui' };
  try {
    return { ok: true, data: extractJSON(result.text ?? '') as T };
  } catch (error) {
    return { ok: false, error: `AI:n vastausta ei voitu lukea: ${(error as Error).message}` };
  }
}

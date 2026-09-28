/**
 * AI usage log per project (.faust/usage.json): token totals per day and
 * model. Costs are computed when shown, so a price correction applies to
 * the whole history.
 */
import type { ProviderId, TokenUsage } from './types';
import { estimateCost, priceFor, type ModelPrice } from './models';

export interface UsageRow extends Required<TokenUsage> {
  provider: ProviderId;
  model: string;
  calls: number;
}

export interface UsageFile {
  version: 1;
  /** date (YYYY-MM-DD) -> "provider/model" -> totals */
  days: Record<string, Record<string, UsageRow>>;
}

export function emptyUsage(): UsageFile {
  return { version: 1, days: {} };
}

export function addUsage(file: UsageFile, date: string, provider: ProviderId, model: string, usage: TokenUsage): UsageFile {
  const key = `${provider}/${model}`;
  const day = { ...(file.days[date] ?? {}) };
  const row = day[key] ?? { provider, model, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  day[key] = {
    ...row,
    calls: row.calls + 1,
    inputTokens: row.inputTokens + (usage.inputTokens ?? 0),
    outputTokens: row.outputTokens + (usage.outputTokens ?? 0),
    cacheReadTokens: row.cacheReadTokens + (usage.cacheReadTokens ?? 0),
    cacheWriteTokens: row.cacheWriteTokens + (usage.cacheWriteTokens ?? 0)
  };
  return { ...file, days: { ...file.days, [date]: day } };
}

export interface UsageSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD for rows with a known price */
  cost: number;
  /** Rows whose model has no known price */
  unpriced: string[];
}

/** Totals over the days for which `include(date)` is true */
export function summarizeUsage(file: UsageFile, include: (date: string) => boolean, overrides: Record<string, ModelPrice> = {}): UsageSummary {
  const out: UsageSummary = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0, unpriced: [] };
  for (const [date, rows] of Object.entries(file.days)) {
    if (!include(date)) continue;
    for (const row of Object.values(rows)) {
      out.calls += row.calls;
      out.inputTokens += row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;
      out.outputTokens += row.outputTokens;
      const cost = estimateCost(priceFor(row.provider, row.model, overrides), row);
      if (cost === null) {
        if (!out.unpriced.includes(row.model)) out.unpriced.push(row.model);
      } else out.cost += cost;
    }
  }
  return out;
}

/** Models that appear in the log, most used first */
export function usedModels(file: UsageFile): { provider: ProviderId; model: string }[] {
  const counts = new Map<string, { provider: ProviderId; model: string; calls: number }>();
  for (const rows of Object.values(file.days)) {
    for (const row of Object.values(rows)) {
      const key = `${row.provider}/${row.model}`;
      const prev = counts.get(key);
      counts.set(key, { provider: row.provider, model: row.model, calls: (prev?.calls ?? 0) + row.calls });
    }
  }
  return [...counts.values()].sort((a, b) => b.calls - a.calls);
}

/** Local calendar date, e.g. 2026-09-28 */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

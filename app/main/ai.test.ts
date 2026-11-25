import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { OpenProject } from '../shared/types';
import { projectTools } from './aiTools';
import { generate } from './ai';
import { addUsage, emptyUsage, summarizeUsage } from '../shared/usage';
import { estimateCost, priceFor, resolveModel } from '../shared/models';

const PROJECT = {
  path: '/tmp/x',
  manifest: {
    structure: [
      { id: 'a', type: 'chapter', title: 'Ensimmäinen luku', file: 'manuscript/a.md', children: [{ id: 'b', type: 'scene', title: 'Mökillä', file: 'manuscript/b.md' }] }
    ]
  },
  docs: {
    a: { meta: { id: 'a', title: 'Ensimmäinen luku', type: 'chapter', status: 'draft', synopsis: 'Alku', notes: '' }, body: 'Aino saapuu kaupunkiin.' },
    b: { meta: { id: 'b', title: 'Mökillä', type: 'scene', status: 'final', synopsis: '', notes: '', pov: 'Aino' }, body: 'Aino istui laiturilla. Kirje oli *Ainon* taskussa.' }
  },
  bible: {
    c1: { id: 'c1', kind: 'characters', name: 'Aino Virta', summary: 'Päähenkilö', fields: { ikä: '34' }, body: 'Pelkää hylkäämistä.' },
    l1: { id: 'l1', kind: 'locations', name: 'Mökki', summary: '', fields: {}, body: 'Järven rannalla.' }
  }
} as unknown as OpenProject;

describe('project tools', () => {
  const tools = projectTools(PROJECT);

  it('looks up bible entries by partial name', () => {
    const r = tools.run('get_bible_entry', { name: 'aino' });
    expect(r.output).toContain('Aino Virta (henkilö)');
    expect(r.output).toContain('ikä: 34');
    expect(r.output).toContain('Pelkää hylkäämistä.');
    expect(r.label).toBe('tietopankki: Aino Virta');
    expect(tools.run('get_bible_entry', { name: 'Kalle' }).output).toContain('Nimet: Aino Virta, Mökki');
  });

  it('reads documents by title', () => {
    const r = tools.run('get_document', { title: 'mökillä' });
    expect(r.output).toContain('KOHTAUS: Mökillä');
    expect(r.output).toContain('Näkökulmahenkilö: Aino');
    expect(r.output).toContain('Aino istui laiturilla.');
    expect(tools.run('get_document', { title: 'Ensimmäinen' }).output).toContain('Sisältää: Mökillä');
  });

  it('searches the manuscript, also across emphasis', () => {
    const r = tools.run('search_manuscript', { query: 'Ainon' });
    expect(r.output).toContain('1 osumaa');
    expect(r.output).toContain('[Mökillä]');
    expect(tools.run('search_manuscript', { query: 'zzz' }).output).toContain('Ei osumia');
    expect(tools.run('nope', {}).output).toContain('Tuntematon');
  });
});

describe('usage and prices', () => {
  it('accumulates usage per day and model and estimates cost', () => {
    let file = emptyUsage();
    file = addUsage(file, '2026-09-28', 'anthropic', 'claude-sonnet-5', { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 10000 });
    file = addUsage(file, '2026-09-28', 'anthropic', 'claude-sonnet-5', { inputTokens: 1000, outputTokens: 500 });
    file = addUsage(file, '2026-09-27', 'ollama', 'gemma3', { inputTokens: 5000, outputTokens: 5000 });
    file = addUsage(file, '2026-09-27', 'anthropic', 'claude-fable-5-1', { inputTokens: 5, outputTokens: 5 });
    expect(file.days['2026-09-28']['anthropic/claude-sonnet-5'].calls).toBe(2);

    const today = summarizeUsage(file, d => d === '2026-09-28');
    // 2000 in + 1000 cache reads at 10 %: 3000 * 3 / 1e6 = 0.009; 1000 out * 15 / 1e6 = 0.015
    expect(today.cost).toBeCloseTo(0.024, 6);
    const all = summarizeUsage(file, () => true);
    expect(all.unpriced).toEqual(['claude-fable-5-1']);
    expect(summarizeUsage(file, () => true, { 'claude-fable-5-1': { input: 1000000, output: 0 } }).cost).toBeCloseTo(5.024, 6);
  });

  it('knows local models are free and keeps their names', () => {
    expect(estimateCost(priceFor('ollama', 'gpt-oss:20b'), { inputTokens: 1e6, outputTokens: 1e6 })).toBe(0);
    expect(resolveModel('ollama', 'gpt-oss:20b')).toBe('gpt-oss:20b');
    expect(resolveModel('ollama', undefined)).toBe('gemma3');
  });
});

/* ---------- tool loops against a fake provider ---------- */

interface Seen {
  path: string;
  body: Record<string, unknown>;
}

let server: http.Server;
let base = '';
const seen: Seen[] = [];

function sse(res: http.ServerResponse, events: [string | null, unknown][]) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const [event, data] of events) res.write(`${event ? `event: ${event}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
  res.end();
}

function anthropicMessage(round: number, res: http.ServerResponse) {
  const message = { id: `m${round}`, type: 'message', role: 'assistant', model: 'claude-opus-5', content: [], stop_reason: null, usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 50 } };
  const events: [string, unknown][] = [['message_start', { type: 'message_start', message }]];
  if (round === 0) {
    events.push(['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }]);
    events.push(['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Katson tietopankista.' } }]);
    events.push(['content_block_stop', { type: 'content_block_stop', index: 0 }]);
    events.push(['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu1', name: 'get_bible_entry', input: {} } }]);
    events.push(['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"name": "Aino"}' } }]);
    events.push(['content_block_stop', { type: 'content_block_stop', index: 1 }]);
    events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } }]);
  } else {
    events.push(['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }]);
    events.push(['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Aino on 34.' } }]);
    events.push(['content_block_stop', { type: 'content_block_stop', index: 0 }]);
    events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 10 } }]);
  }
  events.push(['message_stop', { type: 'message_stop' }]);
  sse(res, events);
}

function openaiCompletion(round: number, res: http.ServerResponse, model: string) {
  const chunk = (delta: unknown, finish: string | null = null, usage?: unknown) => [
    null,
    { id: 'c', object: 'chat.completion.chunk', created: 0, model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) }
  ];
  const events: [string | null, unknown][] =
    round === 0
      ? [
          chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call1', type: 'function', function: { name: 'search_manuscript', arguments: '' } }] }) as [null, unknown],
          chunk({ tool_calls: [{ index: 0, function: { arguments: '{"query":' } }] }) as [null, unknown],
          chunk({ tool_calls: [{ index: 0, function: { arguments: '"laiturilla"}' } }] }) as [null, unknown],
          chunk({}, 'tool_calls') as [null, unknown],
          [null, { id: 'c', object: 'chat.completion.chunk', created: 0, model, choices: [], usage: { prompt_tokens: 80, completion_tokens: 12 } }]
        ]
      : [
          chunk({ role: 'assistant', content: 'Laituri mainitaan ' }) as [null, unknown],
          chunk({ content: 'kohtauksessa Mökillä.' }) as [null, unknown],
          chunk({}, 'stop') as [null, unknown],
          [null, { id: 'c', object: 'chat.completion.chunk', created: 0, model, choices: [], usage: { prompt_tokens: 120, completion_tokens: 8 } }]
        ];
  events.push([null, '[DONE]']);
  sse(res, events);
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push({ path: req.url ?? '', body });
      const messages = (body.messages ?? []) as { role: string; content: unknown }[];
      if (req.url?.startsWith('/v1/messages')) {
        const hasResult = messages.some(m => Array.isArray(m.content) && m.content.some((b: { type: string }) => b.type === 'tool_result'));
        return anthropicMessage(hasResult ? 1 : 0, res);
      }
      if (req.url?.startsWith('/v1/chat/completions')) {
        const hasResult = messages.some(m => m.role === 'tool');
        return openaiCompletion(body.tools && !hasResult ? 0 : 1, res, body.model);
      }
      res.writeHead(404).end();
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.ANTHROPIC_BASE_URL = base;
  process.env.OPENAI_API_KEY = 'test';
  process.env.OPENAI_BASE_URL = `${base}/v1`;
  process.env.OLLAMA_HOST = base;
});

afterAll(() => {
  server.close();
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OLLAMA_HOST']) delete process.env[k];
});

describe('tool loops', () => {
  it('Anthropic: runs the tool, returns the result and continues', async () => {
    seen.length = 0;
    const streamed: string[] = [];
    const tools: string[] = [];
    const result = await generate(
      { provider: 'anthropic', model: 'claude-opus-5', system: 'S', messages: [{ role: 'user', content: 'Kuinka vanha Aino on?' }], tools: true },
      { tools: projectTools(PROJECT), onText: t => streamed.push(t), onTool: l => tools.push(l) }
    );
    expect(result).toMatchObject({ success: true, text: 'Katson tietopankista.\n\nAino on 34.', lookups: ['tietopankki: Aino Virta'] });
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 30, cacheReadTokens: 100, cacheWriteTokens: 0 });
    expect(tools).toEqual(['tietopankki: Aino Virta']);
    expect(streamed.join('')).toBe(result.text);

    expect(seen).toHaveLength(2);
    expect((seen[0].body.tools as { name: string }[]).map(t => t.name)).toEqual(['get_bible_entry', 'get_document', 'search_manuscript']);
    const second = seen[1].body.messages as { role: string; content: { type: string; content?: string; tool_use_id?: string }[] }[];
    expect(second.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(second[1].content.map(b => b.type)).toEqual(['text', 'tool_use']);
    expect(second[2].content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu1' });
    expect(second[2].content[0].content).toContain('ikä: 34');
  });

  it('OpenAI: assembles streamed tool call arguments', async () => {
    seen.length = 0;
    const result = await generate(
      { provider: 'openai', model: 'gpt-5', system: 'S', messages: [{ role: 'user', content: 'Missä laituri on?' }], tools: true },
      { tools: projectTools(PROJECT) }
    );
    expect(result).toMatchObject({ success: true, text: 'Laituri mainitaan kohtauksessa Mökillä.', lookups: ['haku: laiturilla'] });
    expect(result.usage).toMatchObject({ inputTokens: 200, outputTokens: 20 });
    const second = seen[1].body.messages as { role: string; content: string; tool_calls?: unknown[] }[];
    expect(second.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(second[3].content).toContain('[Mökillä]');
  });

  it('tools are off unless the request asks for them', async () => {
    seen.length = 0;
    await generate({ provider: 'openai', model: 'gpt-5', messages: [{ role: 'user', content: 'Hei' }] }, { tools: projectTools(PROJECT) });
    expect(seen[0].body.tools).toBeUndefined();
  });

  it('Ollama: talks to the local server without a key and without tools', async () => {
    seen.length = 0;
    const result = await generate({ provider: 'ollama', model: 'gemma3', messages: [{ role: 'user', content: 'Hei' }], tools: true }, { tools: projectTools(PROJECT) });
    expect(result.success).toBe(true);
    expect(seen[0].path).toBe('/v1/chat/completions');
    expect(seen[0].body.model).toBe('gemma3');
    expect(seen[0].body.tools).toBeUndefined();
  });

  it('Ollama: explains a server that is not running', async () => {
    process.env.OLLAMA_HOST = 'http://127.0.0.1:9';
    const result = await generate({ provider: 'ollama', model: 'gemma3', messages: [{ role: 'user', content: 'Hei' }] });
    process.env.OLLAMA_HOST = base;
    expect(result.success).toBe(false);
    expect(result.error).toContain('Ollama ei vastaa');
  });
});

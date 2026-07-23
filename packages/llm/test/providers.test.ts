// Live LLM providers (publication readiness): OpenAI + Anthropic request /
// response mapping against injected fetch — no network, real Response objects.

import { afterEach, describe, expect, it } from 'vitest';
import {
  createAnthropicProvider,
  createOpenAIProvider,
  getLLM,
  type ChatMessage,
} from '../src/index.js';

interface RecordedCall {
  url: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers as [string, string][]);
  return { ...(headers as Record<string, string>) };
}

function fakeFetch(responder: (call: RecordedCall) => { status?: number; body: unknown }): {
  fetch: typeof globalThis.fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetch = (async (url: unknown, init?: unknown) => {
    const raw = (init ?? {}) as { method?: string; headers?: unknown; body?: string };
    const call: RecordedCall = {
      url: String(url),
      init: { method: raw.method, headers: normalizeHeaders(raw.headers), body: raw.body },
    };
    calls.push(call);
    const { status = 200, body } = responder(call);
    return jsonResponse(body, status);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function bodyOf(call: RecordedCall | undefined): Record<string, unknown> {
  return JSON.parse(call?.init?.body ?? '{}') as Record<string, unknown>;
}

const savedProvider = process.env.LLM_PROVIDER;
const savedOpenAI = process.env.OPENAI_API_KEY;
const savedAnthropic = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (savedProvider === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = savedProvider;
  if (savedOpenAI === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedOpenAI;
  if (savedAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedAnthropic;
});

describe('getLLM', () => {
  it('defaults to mock and switches on LLM_PROVIDER', () => {
    delete process.env.LLM_PROVIDER;
    expect(getLLM().name).toBe('mock');
    process.env.LLM_PROVIDER = 'openai';
    expect(getLLM().name).toBe('openai');
    process.env.LLM_PROVIDER = 'anthropic';
    expect(getLLM().name).toBe('anthropic');
  });
});

describe('OpenAI provider', () => {
  it('maps messages and parses a plain completion', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      body: { choices: [{ message: { role: 'assistant', content: 'Hello back' } }] },
    }));
    const provider = createOpenAIProvider({ apiKey: 'sk-test', model: 'gpt-test', fetch });
    const res = await provider.chat([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ]);

    expect(res).toEqual({ content: 'Hello back', toolCalls: undefined });
    expect(calls[0]!.url).toContain('api.openai.com/v1/chat/completions');
    expect(calls[0]!.init?.headers?.authorization ?? calls[0]!.init?.headers?.Authorization).toContain('sk-test');
    const body = bodyOf(calls[0]);
    expect(body.model).toBe('gpt-test');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ]);
  });

  it('maps tools + tool_choice and parses tool_calls arguments', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      body: {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'seo.run_audit', arguments: '{"url":"https://x.com"}' } }],
            },
          },
        ],
      },
    }));
    const provider = createOpenAIProvider({ apiKey: 'sk-test', fetch });
    const res = await provider.chat(
      [{ role: 'user', content: 'audit my site' }],
      {
        tools: [{ name: 'seo.run_audit', description: 'Run an SEO audit', parameters: { type: 'object' } }],
        toolChoice: { name: 'seo.run_audit' },
      },
    );

    expect(res.toolCalls).toEqual([{ id: 'call_1', name: 'seo.run_audit', args: { url: 'https://x.com' } }]);
    const body = bodyOf(calls[0]);
    const tools = body.tools as { type: string; function: { name: string } }[];
    expect(tools[0]).toMatchObject({ type: 'function', function: { name: 'seo.run_audit' } });
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'seo.run_audit' } });
  });

  it('maps tool-result messages with tool_call_id', async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: { choices: [{ message: { content: 'done' } }] } }));
    const provider = createOpenAIProvider({ apiKey: 'sk-test', fetch });
    const messages: ChatMessage[] = [
      { role: 'user', content: 'audit' },
      { role: 'assistant', content: '' },
      { role: 'tool', content: '{"score":58}', name: 'seo.run_audit', toolCallId: 'call_1' },
    ];
    await provider.chat(messages);
    const body = bodyOf(calls[0]);
    expect((body.messages as unknown[])[2]).toEqual({ role: 'tool', content: '{"score":58}', tool_call_id: 'call_1' });
  });

  it('throws a clear error without an API key (no network call)', async () => {
    delete process.env.OPENAI_API_KEY;
    const { fetch, calls } = fakeFetch(() => ({ body: {} }));
    const provider = createOpenAIProvider({ fetch });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/OPENAI_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it('surfaces API errors', async () => {
    const { fetch } = fakeFetch(() => ({ status: 400, body: { error: { message: 'bad request' } } }));
    const provider = createOpenAIProvider({ apiKey: 'sk-test', fetch });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow();
  });
});

describe('Anthropic provider', () => {
  it('extracts system, maps messages, and parses text + tool_use blocks', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      body: {
        content: [
          { type: 'text', text: 'Launching that audit. ' },
          { type: 'tool_use', id: 'toolu_1', name: 'seo.run_audit', input: { url: 'https://x.com' } },
        ],
      },
    }));
    const provider = createAnthropicProvider({ apiKey: 'sk-ant', model: 'claude-test', fetch });
    const res = await provider.chat([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'audit my site' },
    ]);

    expect(res.content).toBe('Launching that audit. ');
    expect(res.toolCalls).toEqual([{ id: 'toolu_1', name: 'seo.run_audit', args: { url: 'https://x.com' } }]);

    expect(calls[0]!.url).toContain('api.anthropic.com/v1/messages');
    const headers = calls[0]!.init?.headers ?? {};
    expect(headers['x-api-key']).toBe('sk-ant');
    expect(headers['anthropic-version']).toBeTruthy();

    const body = bodyOf(calls[0]);
    expect(body.model).toBe('claude-test');
    expect(body.system).toBe('You are helpful.');
    // system messages are NOT in the turns array
    expect(body.messages).toEqual([{ role: 'user', content: 'audit my site' }]);
  });

  it('maps tool results to user-role tool_result blocks and tools to input_schema', async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: { content: [{ type: 'text', text: 'ok' }] } }));
    const provider = createAnthropicProvider({ apiKey: 'sk-ant', fetch });
    await provider.chat(
      [
        { role: 'user', content: 'audit' },
        { role: 'assistant', content: 'running' },
        { role: 'tool', content: '{"score":58}', name: 'seo.run_audit', toolCallId: 'toolu_1' },
      ],
      { tools: [{ name: 'seo.run_audit', description: 'Run an SEO audit', parameters: { type: 'object' } }] },
    );
    const body = bodyOf(calls[0]);
    const messages = body.messages as unknown[];
    expect(messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"score":58}' }],
    });
    const tools = body.tools as { name: string; input_schema: unknown }[];
    expect(tools[0]).toMatchObject({ name: 'seo.run_audit', input_schema: { type: 'object' } });
  });

  it('throws a clear error without an API key (no network call)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { fetch, calls } = fakeFetch(() => ({ body: {} }));
    const provider = createAnthropicProvider({ fetch });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/ANTHROPIC_API_KEY/);
    expect(calls).toHaveLength(0);
  });
});


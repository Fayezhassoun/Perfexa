// Live LLM providers (publication readiness): OpenAI + Anthropic request /
// response mapping against injected fetch — no network, real Response objects.

import { afterEach, describe, expect, it } from 'vitest';
import {
  createAnthropicProvider,
  createChatGPTGroundedProvider,
  createGeminiGroundedProvider,
  createGeminiProvider,
  createOpenAIProvider,
  getLLM,
  type ChatMessage,
} from '../src/index.js';
import { extractGroundingCitations } from '../src/providers/gemini.js';
import { extractUrlCitations } from '../src/providers/openai.js';

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
const savedGemini = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (savedProvider === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = savedProvider;
  if (savedOpenAI === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedOpenAI;
  if (savedAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedAnthropic;
  if (savedGemini === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = savedGemini;
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

describe('Gemini provider', () => {
  it('hits the OpenAI-compat endpoint and maps usage for metering', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      body: {
        choices: [{ message: { role: 'assistant', content: 'Grounded answer.' } }],
        usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 },
      },
    }));
    const provider = createGeminiProvider({ apiKey: 'gm-test', model: 'gemini-test', fetch });
    const res = await provider.chat([{ role: 'user', content: 'Best CRM for small biz?' }]);

    expect(res.content).toBe('Grounded answer.');
    expect(res.usage).toEqual({ promptTokens: 12, completionTokens: 34, totalTokens: 46 });
    expect(calls[0]!.url).toContain('generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  });

  it('returns no grounding citations from the OpenAI-compat surface', async () => {
    const { fetch } = fakeFetch(() => ({
      body: { choices: [{ message: { role: 'assistant', content: 'plain answer' } }] },
    }));
    const provider = createGeminiProvider({ apiKey: 'gm-test', fetch });
    const res = await provider.chat([{ role: 'user', content: 'Best CRM?' }]);
    expect(res.groundingCitations).toBeUndefined();
  });
});

describe('Gemini grounded provider (native generateContent)', () => {
  it('calls the native endpoint with the google_search tool and x-goog-api-key', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      body: {
        candidates: [
          {
            content: { parts: [{ text: 'HubSpot is a strong pick.' }] },
            groundingMetadata: {
              groundingChunks: [
                { web: { uri: 'https://example.com/review', title: 'CRM review' } },
                { web: { uri: 'https://example.com/review' } }, // duplicate URL — deduped
                { web: { uri: 'https://other.com/list', title: 'Top CRMs' } },
                { web: {} }, // no URL — dropped (honesty rail)
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 34, totalTokenCount: 46 },
      },
    }));
    const provider = createGeminiGroundedProvider({ apiKey: 'gm-test', model: 'gemini-test', fetch });
    const res = await provider.chat([
      { role: 'system', content: 'You are a search assistant.' },
      { role: 'user', content: 'Best CRM?' },
    ]);

    expect(calls[0]!.url).toContain('/v1beta/models/gemini-test:generateContent');
    expect(calls[0]!.init?.headers?.['x-goog-api-key']).toBe('gm-test');
    const body = bodyOf(calls[0]);
    expect(body.tools).toEqual([{ google_search: {} }]);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'You are a search assistant.' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Best CRM?' }] }]);

    expect(res.content).toBe('HubSpot is a strong pick.');
    expect(res.usage).toEqual({ promptTokens: 12, completionTokens: 34, totalTokens: 46 });
    expect(res.groundingCitations).toEqual([
      { title: 'CRM review', url: 'https://example.com/review' },
      { title: 'Top CRMs', url: 'https://other.com/list' },
    ]);
  });

  it('throws a clear error without an API key (no network call)', async () => {
    delete process.env.GEMINI_API_KEY;
    const { fetch, calls } = fakeFetch(() => ({ body: {} }));
    const provider = createGeminiGroundedProvider({ fetch });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/GEMINI_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it('surfaces native API errors', async () => {
    const { fetch } = fakeFetch(() => ({ status: 400, body: { error: { message: 'bad model' } } }));
    const provider = createGeminiGroundedProvider({ apiKey: 'gm-test', fetch });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/bad model/);
  });
});

describe('ChatGPT grounded provider (Responses API + web_search)', () => {
  it('calls /responses with the web_search tool and bearer key, maps answer + citations + usage', async () => {
    const { fetch, calls } = fakeFetch(() => ({
      body: {
        id: 'resp_1',
        status: 'completed',
        output: [
          { type: 'web_search_call', id: 'ws_1', status: 'completed' },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'HubSpot is a strong pick. ',
                annotations: [
                  {
                    type: 'url_citation',
                    url_citation: {
                      url: 'https://example.com/review',
                      title: 'CRM review',
                      start_index: 0,
                      end_index: 6,
                    },
                  },
                ],
              },
              {
                type: 'output_text',
                text: 'Salesforce comes up too.',
                annotations: [
                  {
                    type: 'url_citation',
                    url_citation: { url: 'https://example.com/review', title: 'dup' }, // deduped
                  },
                  { type: 'url_citation', url_citation: { url: 'https://other.com/list', title: 'Top CRMs' } },
                  { type: 'url_citation', url_citation: { title: 'no url' } }, // dropped (honesty rail)
                ],
              },
            ],
          },
        ],
        usage: { input_tokens: 12, output_tokens: 34, total_tokens: 46 },
      },
    }));
    const provider = createChatGPTGroundedProvider({ apiKey: 'sk-test', model: 'gpt-test', fetch });
    const res = await provider.chat(
      [{ role: 'system', content: 'You are a search assistant.' }, { role: 'user', content: 'Best CRM?' }],
      { maxTokens: 512 },
    );

    expect(calls[0]!.url).toContain('api.openai.com/v1/responses');
    expect(calls[0]!.init?.headers?.authorization).toBe('Bearer sk-test');
    const body = bodyOf(calls[0]);
    expect(body.model).toBe('gpt-test');
    expect(body.instructions).toBe('You are a search assistant.');
    expect(body.input).toEqual([{ role: 'user', content: 'Best CRM?' }]);
    expect(body.tools).toEqual([{ type: 'web_search' }]);
    expect(body.max_output_tokens).toBe(512);

    expect(res.content).toBe('HubSpot is a strong pick. Salesforce comes up too.');
    expect(res.usage).toEqual({ promptTokens: 12, completionTokens: 34, totalTokens: 46 });
    expect(res.groundingCitations).toEqual([
      { title: 'CRM review', url: 'https://example.com/review' },
      { title: 'Top CRMs', url: 'https://other.com/list' },
    ]);
  });

  it('defaults to gpt-5.1-mini and omits instructions when there is no system message', async () => {
    const { fetch, calls } = fakeFetch(() => ({ body: { output: [], usage: {} } }));
    const provider = createChatGPTGroundedProvider({ apiKey: 'sk-test', fetch });
    await provider.chat([{ role: 'user', content: 'Best CRM?' }]);
    const body = bodyOf(calls[0]);
    expect(body.model).toBe('gpt-5.1-mini');
    expect('instructions' in body).toBe(false);
  });

  it('throws a clear error without an API key (no network call)', async () => {
    delete process.env.OPENAI_API_KEY;
    const { fetch, calls } = fakeFetch(() => ({ body: {} }));
    const provider = createChatGPTGroundedProvider({ fetch });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/OPENAI_API_KEY/);
    expect(calls).toHaveLength(0);
  });

  it('surfaces Responses API errors', async () => {
    const { fetch } = fakeFetch(() => ({ status: 400, body: { error: { message: 'bad model' } } }));
    const provider = createChatGPTGroundedProvider({ apiKey: 'sk-test', fetch });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/bad model/);
  });
});

describe('extractGroundingCitations', () => {
  it('returns undefined for missing metadata or empty chunks', () => {
    expect(extractGroundingCitations(undefined)).toBeUndefined();
    expect(extractGroundingCitations({ content: 'x' })).toBeUndefined();
    expect(extractGroundingCitations({ grounding_metadata: {} })).toBeUndefined();
    expect(extractGroundingCitations({ grounding_metadata: { grounding_chunks: [] } })).toBeUndefined();
  });

  it('accepts camelCase metadata and keeps only entries with a real URL', () => {
    const got = extractGroundingCitations({
      groundingMetadata: {
        groundingChunks: [{ web: { uri: 'https://a.com' } }, { web: { title: 'no url' } }],
      },
    });
    expect(got).toEqual([{ url: 'https://a.com' }]);
  });
});

describe('extractUrlCitations (OpenAI annotations)', () => {
  it('returns undefined when there are no annotations', () => {
    expect(extractUrlCitations(undefined)).toBeUndefined();
    expect(extractUrlCitations({ content: 'x' })).toBeUndefined();
    expect(extractUrlCitations({ annotations: [] })).toBeUndefined();
  });

  it('maps url_citation annotations, dedupes, and drops entries without a URL', () => {
    const got = extractUrlCitations({
      annotations: [
        { type: 'url_citation', url_citation: { url: 'https://a.com', title: 'A', start_index: 0, end_index: 1 } },
        { type: 'url_citation', url_citation: { url: 'https://a.com', title: 'dup' } },
        { type: 'url_citation', url_citation: { url: 'https://b.com' } },
        { type: 'url_citation', url_citation: { title: 'no url' } },
        { type: 'something_else' },
      ],
    });
    expect(got).toEqual([
      { title: 'A', url: 'https://a.com' },
      { url: 'https://b.com' },
    ]);
  });

  it('is surfaced as groundingCitations by the OpenAI provider', async () => {
    const { fetch } = fakeFetch(() => ({
      body: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Answer [1].',
              annotations: [
                { type: 'url_citation', url_citation: { url: 'https://src.example/x', title: 'Src' } },
              ],
            },
          },
        ],
      },
    }));
    const provider = createOpenAIProvider({ apiKey: 'sk-test', fetch });
    const res = await provider.chat([{ role: 'user', content: 'q' }]);
    expect(res.groundingCitations).toEqual([{ title: 'Src', url: 'https://src.example/x' }]);
  });
});


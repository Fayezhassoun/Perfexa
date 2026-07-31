import { describe, expect, it } from 'vitest';
import {
  LLM_PROVIDERS,
  createProviderById,
  getLLMForConfig,
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

describe('LLM Registry', () => {
  it('contains all 9 expected providers', () => {
    const ids = LLM_PROVIDERS.map((p) => p.id);
    expect(ids).toEqual([
      'mock',
      'openai',
      'anthropic',
      'deepseek',
      'gemini',
      'groq',
      'mistral',
      'ollama',
      'qwen',
    ]);
  });

  it('throws on unknown provider id', () => {
    expect(() => createProviderById('nonexistent')).toThrow(/Unknown LLM provider: nonexistent/);
  });

  it('createProviderById returns a provider with matching name', () => {
    const ids = ['mock', 'openai', 'anthropic', 'deepseek', 'gemini', 'groq', 'mistral', 'ollama', 'qwen'];
    for (const id of ids) {
      const provider = createProviderById(id, { apiKey: 'test-key' });
      expect(provider.name).toBe(id);
    }
  });

  describe('new OpenAI-compatible providers chat execution', () => {
    const newProviders = [
      { id: 'gemini', expectedUrlSubstr: 'generativelanguage.googleapis.com/v1beta/openai/' },
      { id: 'groq', expectedUrlSubstr: 'api.groq.com/openai/v1' },
      { id: 'mistral', expectedUrlSubstr: 'api.mistral.ai/v1' },
      { id: 'ollama', expectedUrlSubstr: 'localhost:11434/v1' },
      { id: 'qwen', expectedUrlSubstr: 'dashscope-intl.aliyuncs.com/compatible-mode/v1' },
    ];

    for (const { id, expectedUrlSubstr } of newProviders) {
      it(`${id} provider sends requests to correct endpoint and parses responses`, async () => {
        const { fetch, calls } = fakeFetch(() => ({
          body: {
            choices: [
              {
                message: {
                  content: `Response from ${id}`,
                  tool_calls: [
                    {
                      id: `call_${id}`,
                      type: 'function',
                      function: { name: 'test.tool', arguments: '{"foo":"bar"}' },
                    },
                  ],
                },
              },
            ],
          },
        }));

        const provider = createProviderById(id, { apiKey: 'test-key', fetch });
        const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
        const res = await provider.chat(messages, {
          tools: [{ name: 'test.tool', description: 'test', parameters: { type: 'object' } }],
        });

        expect(res.content).toBe(`Response from ${id}`);
        expect(res.toolCalls).toEqual([{ id: `call_${id}`, name: 'test.tool', args: { foo: 'bar' } }]);
        expect(calls[0]!.url).toContain(expectedUrlSubstr);
        expect(bodyOf(calls[0]).messages).toEqual([{ role: 'user', content: 'Hello' }]);
      });
    }
  });

  describe('getLLMForConfig', () => {
    it('returns a groq provider with overridden model', async () => {
      const provider = getLLMForConfig({ provider: 'groq', model: 'x' });
      expect(provider.name).toBe('groq');
    });
  });
});

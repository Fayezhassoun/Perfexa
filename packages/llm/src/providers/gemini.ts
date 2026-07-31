// Google Gemini provider — OpenAI-compatible API.
// https://generativelanguage.googleapis.com/v1beta/openai/

import OpenAI from 'openai';
import type { ChatMessage, ChatOptions, LLMProvider, LLMResponse, ToolCall } from '../types.js';

type OAIMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: unknown }
  | { role: 'tool'; content: string; tool_call_id: string };

function toOAIMessages(messages: ChatMessage[]): OAIMessage[] {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_call_id: m.toolCallId ?? '' };
    }
    if (m.role === 'assistant') return { role: 'assistant', content: m.content };
    return { role: m.role, content: m.content };
  });
}

export interface GeminiProviderOptions {
  /** Defaults to GEMINI_API_KEY. */
  apiKey?: string;
  /** Defaults to https://generativelanguage.googleapis.com/v1beta/openai/ */
  baseURL?: string;
  /** Defaults to LLM_MODEL, then gemini-2.0-flash. */
  model?: string;
  /** Injectable fetch — used by tests. */
  fetch?: typeof fetch;
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

export function createGeminiProvider(options?: GeminiProviderOptions): LLMProvider {
  let client: OpenAI | null = null;
  const getClient = () => {
    const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set. Set it or use LLM_PROVIDER=mock.');
    }
    client ??= new OpenAI({
      apiKey,
      baseURL: options?.baseURL ?? GEMINI_BASE_URL,
      ...(options?.fetch ? { fetch: options.fetch } : {}),
    });
    return client;
  };

  return {
    name: 'gemini',
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse> {
      const model = options?.model ?? process.env.LLM_MODEL ?? 'gemini-2.0-flash';
      const res = await getClient().chat.completions.create({
        model,
        messages: toOAIMessages(messages) as OpenAI.ChatCompletionMessageParam[],
        ...(opts?.tools?.length
          ? {
              tools: opts.tools.map((t) => ({
                type: 'function' as const,
                function: { name: t.name, description: t.description, parameters: t.parameters },
              })),
              tool_choice:
                typeof opts.toolChoice === 'object'
                  ? { type: 'function' as const, function: { name: opts.toolChoice.name } }
                  : (opts.toolChoice ?? 'auto'),
            }
          : {}),
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens ?? 1500,
      });
      const choice = res.choices[0]?.message;
      const toolCalls: ToolCall[] | undefined = choice?.tool_calls?.map((tc) => {
        const fn = (tc as { function?: { name?: string; arguments?: string } }).function;
        let args: Record<string, unknown> = {};
        try {
          args = fn?.arguments ? (JSON.parse(fn.arguments) as Record<string, unknown>) : {};
        } catch {
          args = {};
        }
        return { id: tc.id, name: fn?.name ?? '', args };
      });
      return { content: choice?.content ?? '', toolCalls: toolCalls?.length ? toolCalls : undefined };
    },
  };
}

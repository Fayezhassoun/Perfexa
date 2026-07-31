// Mistral AI provider — OpenAI-compatible API (https://api.mistral.ai/v1).

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

export interface MistralProviderOptions {
  /** Defaults to MISTRAL_API_KEY. */
  apiKey?: string;
  /** Defaults to https://api.mistral.ai/v1 */
  baseURL?: string;
  /** Defaults to LLM_MODEL, then mistral-large-latest. */
  model?: string;
  /** Injectable fetch — used by tests. */
  fetch?: typeof fetch;
}

const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';

export function createMistralProvider(options?: MistralProviderOptions): LLMProvider {
  let client: OpenAI | null = null;
  const getClient = () => {
    const apiKey = options?.apiKey ?? process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY is not set. Set it or use LLM_PROVIDER=mock.');
    }
    client ??= new OpenAI({
      apiKey,
      baseURL: options?.baseURL ?? MISTRAL_BASE_URL,
      ...(options?.fetch ? { fetch: options.fetch } : {}),
    });
    return client;
  };

  return {
    name: 'mistral',
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse> {
      const model = options?.model ?? process.env.LLM_MODEL ?? 'mistral-large-latest';
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

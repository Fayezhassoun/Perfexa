// Anthropic provider (messages API with tool use).

import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ChatOptions, LLMProvider, LLMResponse, ToolCall } from '../types.js';

export interface AnthropicProviderOptions {
  /** Defaults to ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Defaults to LLM_MODEL, then claude-3-5-haiku. */
  model?: string;
  /** Injectable fetch — used by tests; production uses the SDK default. */
  fetch?: typeof fetch;
}

export function createAnthropicProvider(options?: AnthropicProviderOptions): LLMProvider {
  let client: Anthropic | null = null;
  const getClient = () => {
    const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set. Set it or use LLM_PROVIDER=mock.');
    }
    client ??= new Anthropic({ apiKey, ...(options?.fetch ? { fetch: options.fetch } : {}) });
    return client;
  };

  return {
    name: 'anthropic',
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse> {
      const model = options?.model ?? process.env.LLM_MODEL ?? 'claude-haiku-4-5';
      const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n');
      const turns = messages
        .filter((m) => m.role !== 'system')
        .map((m): Anthropic.MessageParam => {
          if (m.role === 'tool') {
            return {
              role: 'user',
              content: [{ type: 'tool_result', tool_use_id: m.toolCallId ?? '', content: m.content }],
            };
          }
          return { role: m.role, content: m.content };
        });

      const res = await getClient().messages.create({
        model,
        system: system || undefined,
        messages: turns,
        ...(opts?.tools?.length
          ? {
              tools: opts.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters as Anthropic.Tool.InputSchema,
              })),
              tool_choice:
                typeof opts?.toolChoice === 'object'
                  ? { type: 'tool' as const, name: opts.toolChoice.name }
                  : { type: 'auto' as const },
            }
          : {}),
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens ?? 1500,
      });

      let content = '';
      const toolCalls: ToolCall[] = [];
      for (const block of res.content) {
        if (block.type === 'text') content += block.text;
        if (block.type === 'tool_use') {
          toolCalls.push({ id: block.id, name: block.name, args: (block.input ?? {}) as Record<string, unknown> });
        }
      }
      return { content, toolCalls: toolCalls.length ? toolCalls : undefined };
    },
  };
}

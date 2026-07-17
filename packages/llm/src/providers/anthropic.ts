// Anthropic provider (messages API with tool use).

import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ChatOptions, LLMProvider, LLMResponse, ToolCall } from '../types.js';

export function createAnthropicProvider(): LLMProvider {
  let client: Anthropic | null = null;
  const getClient = () => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set. Set it or use LLM_PROVIDER=mock.');
    }
    client ??= new Anthropic();
    return client;
  };

  return {
    name: 'anthropic',
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse> {
      const model = process.env.LLM_MODEL || 'claude-3-5-haiku-20241022';
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

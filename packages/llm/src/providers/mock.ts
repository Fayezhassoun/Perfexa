// Deterministic offline provider. The orchestrator's mock path is rule-based
// and never calls this; it exists so LLM-dependent code has a safe fallback.

import type { ChatMessage, LLMProvider, LLMResponse } from '../types.js';

export function createMockProvider(): LLMProvider {
  return {
    name: 'mock',
    async chat(messages: ChatMessage[]): Promise<LLMResponse> {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const echo = (lastUser?.content ?? '').slice(0, 80);
      return {
        content: `[demo-mode LLM] I received: "${echo}". Set LLM_PROVIDER=openai or anthropic with an API key for full reasoning.`,
      };
    },
  };
}

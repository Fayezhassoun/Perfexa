// @voxmarketer/llm — provider-agnostic LLM wrapper with function calling.

export * from './types.js';
export { zodToJsonSchema } from './zod-to-json-schema.js';

import type { LLMProvider } from './types.js';
import { createMockProvider } from './providers/mock.js';
import { createOpenAIProvider } from './providers/openai.js';
import { createAnthropicProvider } from './providers/anthropic.js';

export function getLLM(): LLMProvider {
  switch (process.env.LLM_PROVIDER ?? 'mock') {
    case 'openai':
      return createOpenAIProvider();
    case 'anthropic':
      return createAnthropicProvider();
    default:
      return createMockProvider();
  }
}

export { createMockProvider, createOpenAIProvider, createAnthropicProvider };

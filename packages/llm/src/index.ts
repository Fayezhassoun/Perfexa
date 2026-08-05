// @growthcrew/llm — provider-agnostic LLM wrapper with function calling.

export * from './types.js';
export { zodToJsonSchema } from './zod-to-json-schema.js';
export * from './registry.js';

import type { LLMConfig, LLMProvider } from './types.js';
import { createProviderById } from './registry.js';
import { createMockProvider } from './providers/mock.js';
import { createOpenAIProvider } from './providers/openai.js';
import { createAnthropicProvider } from './providers/anthropic.js';
import { createDeepSeekProvider } from './providers/deepseek.js';
import { createGeminiProvider } from './providers/gemini.js';
import { createGroqProvider } from './providers/groq.js';
import { createMistralProvider } from './providers/mistral.js';
import { createOllamaProvider } from './providers/ollama.js';
import { createQwenProvider } from './providers/qwen.js';

export function getLLM(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? 'mock';
  try {
    return createProviderById(provider);
  } catch {
    return createMockProvider();
  }
}

export function getLLMForConfig(config?: LLMConfig): LLMProvider {
  const provider = config?.provider || process.env.LLM_PROVIDER || 'mock';
  return createProviderById(provider, config?.model ? { model: config.model } : undefined);
}

export {
  createMockProvider,
  createOpenAIProvider,
  createAnthropicProvider,
  createDeepSeekProvider,
  createGeminiProvider,
  createGroqProvider,
  createMistralProvider,
  createOllamaProvider,
  createQwenProvider,
};
export { createGeminiGroundedProvider } from './providers/gemini.js';
export { createChatGPTGroundedProvider } from './providers/openai.js';

export type { OpenAIProviderOptions, ChatGPTGroundedProviderOptions } from './providers/openai.js';
export type { AnthropicProviderOptions } from './providers/anthropic.js';
export type { DeepSeekProviderOptions } from './providers/deepseek.js';
export type { GeminiProviderOptions, GeminiGroundedProviderOptions } from './providers/gemini.js';
export type { GroqProviderOptions } from './providers/groq.js';
export type { MistralProviderOptions } from './providers/mistral.js';
export type { OllamaProviderOptions } from './providers/ollama.js';
export type { QwenProviderOptions } from './providers/qwen.js';

// Central registry for all supported LLM providers.

import type { LLMProvider } from './types.js';
import { createMockProvider } from './providers/mock.js';
import { createOpenAIProvider } from './providers/openai.js';
import { createAnthropicProvider } from './providers/anthropic.js';
import { createDeepSeekProvider } from './providers/deepseek.js';
import { createGeminiProvider } from './providers/gemini.js';
import { createGroqProvider } from './providers/groq.js';
import { createMistralProvider } from './providers/mistral.js';
import { createOllamaProvider } from './providers/ollama.js';
import { createQwenProvider } from './providers/qwen.js';

export interface ProviderOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  fetch?: typeof fetch;
}

export interface ProviderDescriptor {
  id: string;
  label: string;
  defaultModel: string;
  envKey?: string;
  create: (opts?: ProviderOptions) => LLMProvider;
}

export const LLM_PROVIDERS: ProviderDescriptor[] = [
  {
    id: 'mock',
    label: 'Mock (Local)',
    defaultModel: 'mock',
    create: () => createMockProvider(),
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    envKey: 'OPENAI_API_KEY',
    create: (opts) => createOpenAIProvider(opts),
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-haiku-4-5',
    envKey: 'ANTHROPIC_API_KEY',
    create: (opts) => createAnthropicProvider(opts),
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
    create: (opts) => createDeepSeekProvider(opts),
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    envKey: 'GEMINI_API_KEY',
    create: (opts) => createGeminiProvider(opts),
  },
  {
    id: 'groq',
    label: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
    create: (opts) => createGroqProvider(opts),
  },
  {
    id: 'mistral',
    label: 'Mistral AI',
    defaultModel: 'mistral-large-latest',
    envKey: 'MISTRAL_API_KEY',
    create: (opts) => createMistralProvider(opts),
  },
  {
    id: 'ollama',
    label: 'Ollama',
    defaultModel: 'llama3.1',
    create: (opts) => createOllamaProvider(opts),
  },
  {
    id: 'qwen',
    label: 'Qwen',
    defaultModel: 'qwen-plus',
    envKey: 'QWEN_API_KEY',
    create: (opts) => createQwenProvider(opts),
  },
];

export function createProviderById(id: string, opts?: ProviderOptions): LLMProvider {
  const descriptor = LLM_PROVIDERS.find((p) => p.id === id);
  if (!descriptor) {
    throw new Error(`Unknown LLM provider: ${id}`);
  }
  return descriptor.create(opts);
}

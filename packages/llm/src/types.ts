// Provider-agnostic LLM types (CONTRACTS §8, packages/llm spec).

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** tool name when role === 'tool' */
  name?: string;
  toolCallId?: string;
}

/** JSON-Schema function spec, OpenAI/Anthropic compatible after mapping. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface ChatOptions {
  tools?: ToolSpec[];
  toolChoice?: 'auto' | 'none' | { name: string };
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse>;
}

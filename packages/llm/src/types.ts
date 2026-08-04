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

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** A web citation surfaced by an engine's grounding/search tool. */
export interface GroundingCitation {
  title?: string;
  url: string;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: LLMUsage;
  /** Real web citations from a grounding/search tool (Gemini google_search). */
  groundingCitations?: GroundingCitation[];
}

export interface ChatOptions {
  tools?: ToolSpec[];
  toolChoice?: 'auto' | 'none' | { name: string };
  temperature?: number;
  maxTokens?: number;
  /** Enable the provider's native web-search grounding (Gemini google_search). */
  searchGrounding?: boolean;
}

export interface LLMProvider {
  name: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse>;
}

export interface LLMConfig {
  provider?: string;
  model?: string;
}

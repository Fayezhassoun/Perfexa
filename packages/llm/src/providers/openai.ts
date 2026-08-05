// OpenAI provider (chat completions with function calling) + grounded ChatGPT
// provider (Responses API with the web_search tool).

import OpenAI from 'openai';
import type {
  ChatMessage,
  ChatOptions,
  GroundingCitation,
  LLMProvider,
  LLMResponse,
  ToolCall,
} from '../types.js';

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

/**
 * Extract real web citations from OpenAI-style `url_citation` message
 * annotations (OpenRouter passes Perplexity Sonar's sources through here).
 * Only entries with an actual URL survive — the GEO honesty rail forbids
 * invented sources.
 */
export function extractUrlCitations(message: unknown): GroundingCitation[] | undefined {
  const annotations = (message as Record<string, unknown> | null)?.annotations;
  if (!Array.isArray(annotations)) return undefined;
  const citations: GroundingCitation[] = [];
  const seen = new Set<string>();
  for (const annotation of annotations) {
    if (!annotation || typeof annotation !== 'object') continue;
    const rec = annotation as Record<string, unknown>;
    const uc = (rec.url_citation ?? (rec.type === 'url_citation' ? rec : null)) as
      | Record<string, unknown>
      | null;
    if (!uc) continue;
    const url = typeof uc.url === 'string' ? uc.url : null;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = typeof uc.title === 'string' && uc.title ? uc.title : undefined;
    citations.push(title ? { title, url } : { url });
  }
  return citations.length > 0 ? citations : undefined;
}

export interface OpenAIProviderOptions {
  /** Defaults to OPENAI_API_KEY. */
  apiKey?: string;
  /** Defaults to LLM_MODEL, then gpt-4o-mini. */
  model?: string;
  /** Custom base URL — set to https://openrouter.ai/api/v1 for OpenRouter. Defaults to OPENAI_BASE_URL env. */
  baseURL?: string;
  /** Injectable fetch — used by tests; production uses the SDK default. */
  fetch?: typeof fetch;
}

export function createOpenAIProvider(options?: OpenAIProviderOptions): LLMProvider {
  let client: OpenAI | null = null;
  const getClient = () => {
    const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set. Set it or use LLM_PROVIDER=mock.');
    }
    const baseURL = options?.baseURL ?? process.env.OPENAI_BASE_URL ?? undefined;
    client ??= new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}), ...(options?.fetch ? { fetch: options.fetch } : {}) });
    return client;
  };

  return {
    name: 'openai',
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse> {
      const model = options?.model ?? process.env.LLM_MODEL ?? 'gpt-4o-mini';
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
      return {
        content: choice?.content ?? '',
        toolCalls: toolCalls?.length ? toolCalls : undefined,
        usage: res.usage
          ? {
              promptTokens: res.usage.prompt_tokens ?? 0,
              completionTokens: res.usage.completion_tokens ?? 0,
              totalTokens: res.usage.total_tokens ?? 0,
            }
          : undefined,
        groundingCitations: extractUrlCitations(choice),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Grounded ChatGPT (Responses API + the web_search tool).
// Chat Completions has no first-class web_search tool, so answers that cite
// real web sources require the Responses endpoint. Used by the GEO module's
// ChatGPT engine. Mirrors createGeminiGroundedProvider: raw fetch, no SDK.
// ---------------------------------------------------------------------------

const OPENAI_RESPONSES_BASE_URL = 'https://api.openai.com/v1';

export interface ChatGPTGroundedProviderOptions {
  /** Defaults to OPENAI_API_KEY. Sent as a bearer token. */
  apiKey?: string;
  /** Defaults to https://api.openai.com/v1 */
  baseURL?: string;
  /** Defaults to gpt-5.1-mini. */
  model?: string;
  /** Injectable fetch — used by tests. */
  fetch?: typeof fetch;
}

export function createChatGPTGroundedProvider(options?: ChatGPTGroundedProviderOptions): LLMProvider {
  const fetchImpl = options?.fetch ?? fetch;
  return {
    name: 'chatgpt',
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse> {
      const apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set. Set it or use LLM_PROVIDER=mock.');
      }
      const model = options?.model ?? 'gpt-5.1-mini';
      const base = options?.baseURL ?? OPENAI_RESPONSES_BASE_URL;

      const instructions = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n');
      const input = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      const body = {
        model,
        ...(instructions ? { instructions } : {}),
        input,
        // Native web-search tool — the model answers from live web sources and
        // cites them via url_citation annotations on the output text parts.
        tools: [{ type: 'web_search' }],
        temperature: opts?.temperature ?? 0.3,
        max_output_tokens: opts?.maxTokens ?? 1024,
      };

      const res = await fetchImpl(`${base}/responses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || json?.error) {
        const message = (json?.error as Record<string, unknown> | undefined)?.message ?? res.statusText;
        throw new Error(`ChatGPT Responses call failed (${res.status}): ${message}`);
      }

      // Walk output items: message → content[] → output_text parts. Citations
      // live as url_citation annotations on the parts — same shape as
      // Chat-Completions annotations, deduped across parts.
      let content = '';
      const citations: GroundingCitation[] = [];
      const seen = new Set<string>();
      for (const item of (json?.output as unknown[] | undefined) ?? []) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        if (rec.type !== 'message' || !Array.isArray(rec.content)) continue;
        for (const part of rec.content) {
          if (!part || typeof part !== 'object') continue;
          const p = part as Record<string, unknown>;
          if (p.type !== 'output_text') continue;
          if (typeof p.text === 'string') content += p.text;
          for (const citation of extractUrlCitations(p) ?? []) {
            if (seen.has(citation.url)) continue;
            seen.add(citation.url);
            citations.push(citation);
          }
        }
      }
      const usage = json?.usage as Record<string, number> | undefined;

      return {
        content,
        usage: usage
          ? {
              promptTokens: usage.input_tokens ?? 0,
              completionTokens: usage.output_tokens ?? 0,
              totalTokens: usage.total_tokens ?? 0,
            }
          : undefined,
        groundingCitations: citations.length > 0 ? citations : undefined,
      };
    },
  };
}

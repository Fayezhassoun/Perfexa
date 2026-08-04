// Google Gemini provider — OpenAI-compatible API.
// https://generativelanguage.googleapis.com/v1beta/openai/

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

export interface GeminiProviderOptions {
  /** Defaults to GEMINI_API_KEY. */
  apiKey?: string;
  /** Defaults to https://generativelanguage.googleapis.com/v1beta/openai/ */
  baseURL?: string;
  /** Defaults to LLM_MODEL, then gemini-2.0-flash. */
  model?: string;
  /** Injectable fetch — used by tests. */
  fetch?: typeof fetch;
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

/**
 * Extract real web citations from Gemini grounding metadata. The OpenAI-compat
 * surface nests them under `grounding_metadata` / `groundingMetadata` with a
 * `grounding_chunks` array; handle both spellings defensively. Returns only
 * entries with an actual URL — the GEO honesty rail forbids invented sources.
 */
export function extractGroundingCitations(message: unknown): GroundingCitation[] | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const rec = message as Record<string, unknown>;
  const meta = (rec.grounding_metadata ?? rec.groundingMetadata) as Record<string, unknown> | undefined;
  if (!meta || typeof meta !== 'object') return undefined;
  const chunks = (meta.grounding_chunks ?? meta.groundingChunks) as unknown;
  if (!Array.isArray(chunks)) return undefined;

  const citations: GroundingCitation[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== 'object') continue;
    const web = (chunk as Record<string, unknown>).web as Record<string, unknown> | undefined;
    if (!web || typeof web !== 'object') continue;
    const url = typeof web.uri === 'string' ? web.uri : typeof web.url === 'string' ? web.url : null;
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const title = typeof web.title === 'string' && web.title ? web.title : undefined;
    citations.push(title ? { title, url } : { url });
  }
  return citations.length > 0 ? citations : undefined;
}

export function createGeminiProvider(options?: GeminiProviderOptions): LLMProvider {
  let client: OpenAI | null = null;
  const getClient = () => {
    const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set. Set it or use LLM_PROVIDER=mock.');
    }
    client ??= new OpenAI({
      apiKey,
      baseURL: options?.baseURL ?? GEMINI_BASE_URL,
      ...(options?.fetch ? { fetch: options.fetch } : {}),
    });
    return client;
  };

  return {
    name: 'gemini',
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse> {
      const model = options?.model ?? process.env.LLM_MODEL ?? 'gemini-2.0-flash';
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
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Grounded Gemini (native generateContent + Google-Search tool).
// The OpenAI-compat surface only accepts function tools and rejects the
// google_search grounding tool, so grounded answers (answers that cite real web
// sources) require the native endpoint. Used by the GEO module's Gemini engine.
// ---------------------------------------------------------------------------

const GEMINI_NATIVE_BASE_URL = 'https://generativelanguage.googleapis.com';

export interface GeminiGroundedProviderOptions {
  /** Defaults to GEMINI_API_KEY. Sent as the x-goog-api-key header. */
  apiKey?: string;
  /** Defaults to https://generativelanguage.googleapis.com */
  baseURL?: string;
  /** Defaults to gemini-2.5-flash. */
  model?: string;
  /** Injectable fetch — used by tests. */
  fetch?: typeof fetch;
}

export function createGeminiGroundedProvider(options?: GeminiGroundedProviderOptions): LLMProvider {
  const fetchImpl = options?.fetch ?? fetch;
  return {
    name: 'gemini',
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse> {
      const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set. Set it or use LLM_PROVIDER=mock.');
      }
      const model = options?.model ?? 'gemini-2.5-flash';
      const base = options?.baseURL ?? GEMINI_NATIVE_BASE_URL;

      const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n');
      const contents = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      const body = {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        // Native Google-Search grounding tool — the model answers from live web
        // sources and returns groundingMetadata with the cited URLs.
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: opts?.temperature ?? 0.3,
          maxOutputTokens: opts?.maxTokens ?? 1024,
        },
      };

      const res = await fetchImpl(`${base}/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || json?.error) {
        const message = (json?.error as Record<string, unknown> | undefined)?.message ?? res.statusText;
        throw new Error(`Gemini grounded call failed (${res.status}): ${message}`);
      }

      const candidate = (json?.candidates as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined;
      const parts = (candidate?.content as Record<string, unknown> | undefined)?.parts as
        | { text?: string }[]
        | undefined;
      const content = (parts ?? []).map((p) => p?.text ?? '').join('');
      const usage = json?.usageMetadata as Record<string, number> | undefined;

      return {
        content,
        usage: usage
          ? {
              promptTokens: usage.promptTokenCount ?? 0,
              completionTokens: usage.candidatesTokenCount ?? 0,
              totalTokens: usage.totalTokenCount ?? 0,
            }
          : undefined,
        groundingCitations: extractGroundingCitations(candidate),
      };
    },
  };
}

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

      // Function tools + optional native Google-Search grounding. Grounding is
      // a distinct tool type ({type:'google_search'}), not a function spec.
      const fnTools = (opts?.tools ?? []).map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      const groundingTool = opts?.searchGrounding ? [{ type: 'google_search' as const }] : [];
      const tools = [...fnTools, ...groundingTool];
      const hasFnTools = fnTools.length > 0;

      const res = await getClient().chat.completions.create({
        model,
        messages: toOAIMessages(messages) as OpenAI.ChatCompletionMessageParam[],
        ...(tools.length
          ? {
              tools: tools as OpenAI.ChatCompletionTool[],
              // tool_choice only applies to function tools; never force it when
              // the caller asked for search grounding (model picks freely).
              ...(hasFnTools
                ? {
                    tool_choice:
                      typeof opts?.toolChoice === 'object'
                        ? { type: 'function' as const, function: { name: opts.toolChoice.name } }
                        : (opts?.toolChoice ?? 'auto'),
                  }
                : {}),
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
        groundingCitations: extractGroundingCitations(choice),
      };
    },
  };
}

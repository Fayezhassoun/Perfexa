// GEO / AI Visibility services (GROWTHCREW_GEO_VISIBILITY.md Phase 1).
//
// Tracks whether AI engines actually cite the brand when answering the org's
// tracked questions. Honesty rail: only engines we REALLY queried appear in a
// run's `engines` map, every metric traces to a stored geo_results row, and
// anything without data surfaces as an empty state — never simulated.

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  competitors,
  geoPrompts,
  geoResults,
  geoRuns,
  organizations,
  type Db,
  type GeoCitation,
  type GeoCompetitorMention,
  type GeoEngine,
  type GeoPrompt,
  type GeoResult,
  type GeoRun,
  type GeoRunEngines,
} from '@growthcrew/db';
import {
  createDeepSeekProvider,
  createGeminiProvider,
  createOpenAIProvider,
  type ChatMessage,
  type LLMProvider,
  type LLMResponse,
} from '@growthcrew/llm';
import { hostnameOf } from '@growthcrew/integrations';
import { z } from 'zod';
import type { AgentContext } from '../types.js';
import { createAgentContext } from '../context.js';
import { isWithinBudget, recordUsage } from './llm-usage.js';

export const GEO_MAX_ACTIVE_PROMPTS = 60;
export const GEO_ENGINE_TIMEOUT_MS = 30_000;
export const GEO_ENGINES: GeoEngine[] = ['perplexity', 'gemini'];

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const SONAR_MODEL = 'perplexity/sonar';
const SONAR_SYSTEM_PROMPT =
  'You are a search assistant. Answer the user’s question with current web sources.';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const ANSWER_EXCERPT_CHARS = 600;

// ---------------------------------------------------------------------------
// Engine clients (injectable for tests; keys come from env in production)
// ---------------------------------------------------------------------------

export interface GeoEngineClients {
  /** Perplexity Sonar via OpenRouter — a real search engine with citations. */
  perplexity?: LLMProvider;
  /** Gemini flash with Google-Search grounding enabled. */
  gemini?: LLMProvider;
  /** DeepSeek — parsing/generation only, never used as a tracked engine. */
  parser?: LLMProvider;
}

/** Build live engine clients from env keys. Missing key → engine absent (never faked). */
export function createGeoEngineClients(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): GeoEngineClients {
  const clients: GeoEngineClients = {};
  const openrouterKey = env.OPENROUTER_API_KEY?.trim();
  if (openrouterKey) {
    clients.perplexity = createOpenAIProvider({
      apiKey: openrouterKey,
      baseURL: OPENROUTER_BASE_URL,
      model: env.GEO_SONAR_MODEL?.trim() || SONAR_MODEL,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    clients.gemini = createGeminiProvider({
      apiKey: geminiKey,
      model: env.GEO_GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }
  const deepseekKey = env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey) {
    clients.parser = createDeepSeekProvider({
      apiKey: deepseekKey,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }
  return clients;
}

/** Reject after `ms` so one hung engine can't stall a run (spec: 30s per call). */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Brand + competitor resolution (reuses the existing competitors table — no
// parallel registry)
// ---------------------------------------------------------------------------

export interface GeoBrandInfo {
  name: string;
  domain: string | null;
}

export async function getGeoBrandInfo(ctx: AgentContext): Promise<GeoBrandInfo> {
  const [org] = await ctx.db
    .select({
      name: organizations.name,
      websiteUrl: organizations.websiteUrl,
      brandProfile: organizations.brandProfile,
    })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  const companyName = org?.brandProfile?.companyName?.trim();
  const domain = org?.websiteUrl ? safeHostname(org.websiteUrl) : null;
  return { name: companyName || org?.name || 'the brand', domain };
}

function safeHostname(url: string): string | null {
  try {
    return hostnameOf(/^https?:\/\//.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }
}

/** Competitor display names from the existing competitors module. */
export async function getGeoCompetitorNames(ctx: AgentContext): Promise<string[]> {
  const rows = await ctx.db
    .select({ url: competitors.url, name: competitors.name })
    .from(competitors)
    .where(eq(competitors.orgId, ctx.orgId))
    .orderBy(desc(competitors.createdAt))
    .limit(50);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const name = (row.name ?? safeHostname(row.url) ?? row.url).trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Prompt CRUD (cap of 60 active per org enforced here — the API is thin)
// ---------------------------------------------------------------------------

export class GeoPromptLimitError extends Error {
  constructor() {
    super(`Prompt limit reached: you can track up to ${GEO_MAX_ACTIVE_PROMPTS} active prompts.`);
    this.name = 'GeoPromptLimitError';
  }
}

export async function listPrompts(
  ctx: AgentContext,
  opts?: { activeOnly?: boolean },
): Promise<GeoPrompt[]> {
  return ctx.db
    .select()
    .from(geoPrompts)
    .where(
      opts?.activeOnly
        ? and(eq(geoPrompts.orgId, ctx.orgId), eq(geoPrompts.active, true))
        : eq(geoPrompts.orgId, ctx.orgId),
    )
    .orderBy(asc(geoPrompts.position), asc(geoPrompts.createdAt));
}

export async function addPrompt(
  ctx: AgentContext,
  input: { text: string; category?: string | null },
): Promise<GeoPrompt> {
  const text = input.text.trim();
  if (!text) throw new Error('Prompt text is required.');

  const active = await listPrompts(ctx, { activeOnly: true });
  if (active.length >= GEO_MAX_ACTIVE_PROMPTS) throw new GeoPromptLimitError();

  const [maxPos] = await ctx.db
    .select({ pos: sql<number>`coalesce(max(${geoPrompts.position}), -1)` })
    .from(geoPrompts)
    .where(eq(geoPrompts.orgId, ctx.orgId));
  const [row] = await ctx.db
    .insert(geoPrompts)
    .values({
      orgId: ctx.orgId,
      text,
      category: input.category?.trim() || null,
      position: (maxPos?.pos ?? -1) + 1,
      active: true,
    })
    .returning();
  await ctx.audit.log({
    actorType: ctx.userId ? 'user' : 'system',
    actorId: ctx.userId ?? 'geo',
    action: 'geo.prompt_added',
    entityType: 'geo_prompt',
    entityId: row!.id,
    payload: { text },
  });
  return row!;
}

export async function updatePrompt(
  ctx: AgentContext,
  id: string,
  patch: { text?: string; category?: string | null; active?: boolean },
): Promise<GeoPrompt> {
  const [existing] = await ctx.db
    .select()
    .from(geoPrompts)
    .where(and(eq(geoPrompts.id, id), eq(geoPrompts.orgId, ctx.orgId)))
    .limit(1);
  if (!existing) throw new Error('Prompt not found');

  // Reactivating counts against the cap.
  if (patch.active === true && !existing.active) {
    const active = await listPrompts(ctx, { activeOnly: true });
    if (active.length >= GEO_MAX_ACTIVE_PROMPTS) throw new GeoPromptLimitError();
  }

  const [row] = await ctx.db
    .update(geoPrompts)
    .set({
      ...(patch.text !== undefined ? { text: patch.text.trim() } : {}),
      ...(patch.category !== undefined ? { category: patch.category?.trim() || null } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    })
    .where(eq(geoPrompts.id, id))
    .returning();
  await ctx.audit.log({
    actorType: ctx.userId ? 'user' : 'system',
    actorId: ctx.userId ?? 'geo',
    action: 'geo.prompt_updated',
    entityType: 'geo_prompt',
    entityId: id,
    payload: patch,
  });
  return row!;
}

/** Deactivate (soft delete) so historical runs keep a valid prompt reference. */
export async function removePrompt(ctx: AgentContext, id: string): Promise<{ ok: true }> {
  await updatePrompt(ctx, id, { active: false });
  await ctx.audit.log({
    actorType: ctx.userId ? 'user' : 'system',
    actorId: ctx.userId ?? 'geo',
    action: 'geo.prompt_removed',
    entityType: 'geo_prompt',
    entityId: id,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

export interface GeoScanOptions {
  trigger?: 'manual' | 'scheduled';
  /** Injectable engine clients (tests). Defaults to env-key clients. */
  clients?: GeoEngineClients;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export type GeoScanOutcome =
  | { status: 'skipped'; reason: 'no-prompts' }
  | { status: 'budget_exceeded' }
  | { status: 'run'; run: GeoRun };

/** Drop a single run of sentence punctuation an engine left glued to a URL. */
function trimUrl(url: string): string {
  return url.replace(/[.,;:!?)\]]+$/, '');
}

/** Deterministic citation extraction from an engine answer (real URLs only —
 * we never let the parser LLM rewrite URLs, it would corrupt them). */
export function extractInlineCitations(text: string): GeoCitation[] {
  const citations: GeoCitation[] = [];
  const seen = new Set<string>();
  const push = (url: string, title?: string) => {
    const clean = trimUrl(url);
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    citations.push(title ? { title, url: clean } : { url: clean });
  };

  // Markdown links keep their anchor text as the title (numeric anchors like
  // "[1]" carry no meaning and are dropped).
  const linkRe = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(text)) !== null) {
    const title = match[1]?.trim();
    push(match[2]!, title && !/^\d+$/.test(title) ? title : undefined);
  }
  // Any remaining bare URLs (reference lists, mid-sentence links). URLs already
  // captured as markdown links are deduped by `seen`.
  const bareRe = /https?:\/\/[^\s)\]>]+/g;
  while ((match = bareRe.exec(text)) !== null) {
    push(match[0]);
  }
  return citations;
}

const geoParseSchema = z.object({
  brand_mentioned: z.boolean(),
  brand_rank: z.number().int().positive().nullable(),
  competitor_mentions: z
    .array(z.object({ name: z.string().min(1), count: z.number().int().nonnegative() }))
    .default([]),
  sentiment: z.enum(['positive', 'neutral', 'negative']).nullable(),
});
export type GeoParse = z.infer<typeof geoParseSchema>;

/** Strip markdown fences / prose around a JSON object and parse it. */
export function parseStrictJson(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('no JSON object in response');
  return JSON.parse(raw.slice(start, end + 1));
}

async function parseGeoAnswer(
  parser: LLMProvider,
  opts: { brand: GeoBrandInfo; competitorNames: string[]; question: string; answer: string },
  recordUsageFor: (usage: LLMResponse['usage']) => void,
): Promise<GeoParse | null> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You analyze AI engine answers for brand visibility. Respond with a single JSON object only — no prose, no markdown fences, no trailing commas.',
    },
    {
      role: 'user',
      content: [
        `Brand: "${opts.brand.name}"${opts.brand.domain ? ` (website ${opts.brand.domain})` : ''}`,
        `Known competitors: ${opts.competitorNames.length > 0 ? opts.competitorNames.map((n) => `"${n}"`).join(', ') : '(none)'}`,
        `Question asked to the engine: "${opts.question}"`,
        'Engine answer:',
        opts.answer,
        '',
        'Return JSON with exactly these keys:',
        '{',
        '  "brand_mentioned": boolean, // true only if the brand itself is explicitly named or recommended in the answer',
        '  "brand_rank": number | null, // 1-based position of the brand among the brands/products recommended in the answer (1 = named first); null when absent',
        `  "competitor_mentions": [{"name": string, "count": number}], // only names from the known competitors list (case-insensitive), with how many times each appears`,
        '  "sentiment": "positive" | "neutral" | "negative" | null, // tone of what the answer says about the brand; null when not mentioned',
        '}',
      ].join('\n'),
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await parser.chat(messages, { temperature: 0, maxTokens: 800 });
    recordUsageFor(res.usage);
    try {
      return geoParseSchema.parse(parseStrictJson(res.content));
    } catch {
      // retry once with a nudge appended
      messages.push({ role: 'assistant', content: res.content });
      messages.push({
        role: 'user',
        content:
          'That was not valid. Reply with ONLY the JSON object described above — no other text.',
      });
    }
  }
  return null;
}

/**
 * Run one GEO scan for the org: query every active prompt against every
 * configured engine, parse each real answer, and store one geo_results row
 * per prompt × engine. A failing engine is marked failed in geo_runs.engines
 * and skipped for the remaining prompts — the run itself never aborts.
 */
export async function runGeoScan(
  ctx: AgentContext,
  opts: GeoScanOptions = {},
): Promise<GeoScanOutcome> {
  const prompts = await listPrompts(ctx, { activeOnly: true });
  if (prompts.length === 0) return { status: 'skipped', reason: 'no-prompts' };

  // Cost guardrail: scans are metered exactly like orchestrator turns.
  if (!(await isWithinBudget(ctx))) return { status: 'budget_exceeded' };

  const clients = opts.clients ?? createGeoEngineClients(opts.env ?? process.env, opts.fetchImpl);
  if (!clients.parser) {
    // Parsing is mandatory — without it we cannot extract structured facts.
    throw new Error('GEO scan unavailable: DEEPSEEK_API_KEY is not configured.');
  }
  const timeoutMs = opts.timeoutMs ?? GEO_ENGINE_TIMEOUT_MS;

  const brand = await getGeoBrandInfo(ctx);
  const competitorNames = await getGeoCompetitorNames(ctx);
  const knownLower = new Map(competitorNames.map((n) => [n.toLowerCase(), n]));

  const trigger = opts.trigger ?? 'manual';
  const [run] = await ctx.db
    .insert(geoRuns)
    .values({ orgId: ctx.orgId, status: 'running', trigger, engines: {}, startedAt: ctx.now ?? new Date() })
    .returning();
  const runId = run!.id;

  const engines: GeoRunEngines = {};
  const persistEngines = async () => {
    await ctx.db.update(geoRuns).set({ engines: { ...engines } }).where(eq(geoRuns.id, runId));
  };

  const record = (usage: LLMResponse['usage']) => {
    if (usage) void recordUsage(ctx, usage).catch(() => {});
  };

  async function runEngine(engine: GeoEngine, client: LLMProvider | undefined): Promise<void> {
    if (!client) {
      engines[engine] = { status: 'failed', error: 'engine not configured (missing API key)' };
      await persistEngines();
      return;
    }
    for (const prompt of prompts) {
      let answer: string;
      let groundingCitations: GeoCitation[] | undefined;
      try {
        const messages: ChatMessage[] = [
          { role: 'system', content: SONAR_SYSTEM_PROMPT },
          { role: 'user', content: prompt.text },
        ];
        const res = await withTimeout(
          engine === 'gemini'
            ? client.chat(messages, { searchGrounding: true, maxTokens: 1024 })
            : client.chat(messages, { maxTokens: 1024 }),
          timeoutMs,
          engine,
        );
        answer = (res.content ?? '').trim();
        groundingCitations = res.groundingCitations;
        record(res.usage);
        if (!answer) throw new Error('empty answer');
      } catch (err) {
        engines[engine] = {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        };
        await persistEngines();
        return;
      }

      // Citations: real URLs from the engine itself — grounding metadata for
      // Gemini, inline markdown links for Sonar.
      const citations: GeoCitation[] =
        groundingCitations && groundingCitations.length > 0
          ? groundingCitations
          : extractInlineCitations(answer);

      const parsed = await parseGeoAnswer(
        clients.parser!,
        { brand, competitorNames, question: prompt.text, answer },
        record,
      );

      // Deterministic honesty backstop: the brand must actually appear in the
      // answer text (name or domain) for a mention to count.
      let brandMentioned = parsed?.brand_mentioned ?? false;
      let brandRank = parsed?.brand_rank ?? null;
      let sentiment = parsed?.sentiment ?? null;
      if (brandMentioned && !textMentionsBrand(answer, brand)) {
        brandMentioned = false;
        brandRank = null;
        sentiment = null;
      }
      if (!brandMentioned) {
        brandRank = null;
        sentiment = null;
      }

      // Keep only mentions of competitors from the org's existing list.
      const competitorMentions: GeoCompetitorMention[] = (parsed?.competitor_mentions ?? [])
        .map((m) => {
          const canonical = knownLower.get(m.name.toLowerCase());
          return canonical ? { name: canonical, count: m.count } : null;
        })
        .filter((m): m is GeoCompetitorMention => m !== null && m.count > 0);

      await ctx.db.insert(geoResults).values({
        runId,
        promptId: prompt.id,
        engine,
        brandMentioned,
        brandRank,
        answerExcerpt: answer.slice(0, ANSWER_EXCERPT_CHARS),
        citations,
        competitorMentions,
        sentiment: brandMentioned ? sentiment : null,
        parseFailed: parsed === null,
      });
    }
    engines[engine] = { status: 'ok' };
    await persistEngines();
  }

  await Promise.all([runEngine('perplexity', clients.perplexity), runEngine('gemini', clients.gemini)]);

  const anyOk = Object.values(engines).some((e) => e.status === 'ok');
  const status = anyOk ? 'done' : 'failed';
  const error = anyOk
    ? null
    : Object.entries(engines)
        .map(([engine, e]) => `${engine}: ${e?.error ?? 'failed'}`)
        .join('; ');

  const [finished] = await ctx.db
    .update(geoRuns)
    .set({ status, engines: { ...engines }, finishedAt: ctx.now ?? new Date(), error })
    .where(eq(geoRuns.id, runId))
    .returning();

  await ctx.audit.log({
    actorType: trigger === 'manual' && ctx.userId ? 'user' : 'system',
    actorId: ctx.userId ?? `geo-scan-${trigger}`,
    action: 'geo.scan_completed',
    entityType: 'geo_run',
    entityId: runId,
    metadata: {
      trigger,
      status,
      engines: Object.fromEntries(Object.entries(engines).map(([k, v]) => [k, v?.status])),
      prompts: prompts.length,
    },
  });

  return { status: 'run', run: finished! };
}

function textMentionsBrand(text: string, brand: GeoBrandInfo): boolean {
  const lower = text.toLowerCase();
  if (brand.name && lower.includes(brand.name.toLowerCase())) return true;
  if (brand.domain) {
    const bare = brand.domain.replace(/^www\./, '').toLowerCase();
    if (lower.includes(bare)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Aggregates — always computed from stored geo_results rows (honesty rail)
// ---------------------------------------------------------------------------

export interface GeoEngineSummary {
  engine: GeoEngine;
  status: 'ok' | 'failed';
  error?: string;
  prompts: number;
  mentions: number;
  visibility: number | null; // 0..1, null when the engine has no results
}

export interface GeoRunSummary {
  run: GeoRun;
  visibilityCombined: number | null;
  shareOfVoice: number | null;
  brandMentions: number;
  competitorMentions: number;
  engines: GeoEngineSummary[];
  prompts: {
    prompt: GeoPrompt;
    results: Record<string, GeoResult | undefined>;
    mentionedAnywhere: boolean;
  }[];
}

export async function summarizeRun(ctx: AgentContext, run: GeoRun): Promise<GeoRunSummary> {
  const [results, prompts] = await Promise.all([
    ctx.db.select().from(geoResults).where(eq(geoResults.runId, run.id)),
    listPrompts(ctx, { activeOnly: false }),
  ]);

  const byPrompt = new Map<string, Record<string, GeoResult | undefined>>();
  for (const res of results) {
    const slot = byPrompt.get(res.promptId) ?? {};
    slot[res.engine] = res;
    byPrompt.set(res.promptId, slot);
  }

  const engines: GeoEngineSummary[] = [];
  for (const engine of GEO_ENGINES) {
    const meta = run.engines?.[engine];
    if (!meta) continue; // never queried — honesty rail: not shown as tracked
    const engineResults = results.filter((r) => r.engine === engine);
    const mentions = engineResults.filter((r) => r.brandMentioned).length;
    engines.push({
      engine,
      status: meta.status,
      error: meta.error,
      prompts: engineResults.length,
      mentions,
      visibility: engineResults.length > 0 ? mentions / engineResults.length : null,
    });
  }

  const promptRows = prompts.filter((p) => byPrompt.has(p.id));
  const mentionedPerPrompt = promptRows.map((p) => {
    const slot = byPrompt.get(p.id)!;
    return Object.values(slot).some((r) => r?.brandMentioned);
  });
  const visibilityCombined =
    promptRows.length > 0
      ? mentionedPerPrompt.filter(Boolean).length / promptRows.length
      : null;

  const brandMentions = results.filter((r) => r.brandMentioned).length;
  const competitorMentions = results.reduce(
    (sum, r) => sum + (r.competitorMentions ?? []).reduce((s, m) => s + m.count, 0),
    0,
  );
  const shareOfVoice =
    brandMentions + competitorMentions > 0 ? brandMentions / (brandMentions + competitorMentions) : null;

  return {
    run,
    visibilityCombined,
    shareOfVoice,
    brandMentions,
    competitorMentions,
    engines,
    prompts: promptRows.map((prompt) => ({
      prompt,
      results: byPrompt.get(prompt.id)!,
      mentionedAnywhere: Object.values(byPrompt.get(prompt.id)!).some((r) => r?.brandMentioned),
    })),
  };
}

export async function latestRun(ctx: AgentContext): Promise<GeoRun | null> {
  const [run] = await ctx.db
    .select()
    .from(geoRuns)
    .where(eq(geoRuns.orgId, ctx.orgId))
    .orderBy(desc(geoRuns.createdAt))
    .limit(1);
  return run ?? null;
}

export async function getLatestSummary(ctx: AgentContext): Promise<GeoRunSummary | null> {
  const run = await latestRun(ctx);
  if (!run) return null;
  return summarizeRun(ctx, run);
}

export interface GeoHistoryPoint {
  runId: string;
  createdAt: Date;
  status: string;
  visibilityCombined: number | null;
  engines: { engine: GeoEngine; visibility: number | null }[];
}

/** Last `limit` runs with combined visibility — feeds the trend sparkline. */
export async function getHistory(ctx: AgentContext, limit = 12): Promise<GeoHistoryPoint[]> {
  const runs = await ctx.db
    .select()
    .from(geoRuns)
    .where(eq(geoRuns.orgId, ctx.orgId))
    .orderBy(desc(geoRuns.createdAt))
    .limit(limit);
  if (runs.length === 0) return [];

  const runIds = runs.map((r) => r.id);
  const results = await ctx.db.select().from(geoResults).where(inArray(geoResults.runId, runIds));
  const byRun = new Map<string, GeoResult[]>();
  for (const res of results) {
    const arr = byRun.get(res.runId) ?? [];
    arr.push(res);
    byRun.set(res.runId, arr);
  }

  return runs
    .map((run) => {
      const rows = byRun.get(run.id) ?? [];
      const byPrompt = new Map<string, GeoResult[]>();
      for (const r of rows) {
        const arr = byPrompt.get(r.promptId) ?? [];
        arr.push(r);
        byPrompt.set(r.promptId, arr);
      }
      const promptIds = [...byPrompt.keys()];
      const mentioned = promptIds.filter((id) => byPrompt.get(id)!.some((r) => r.brandMentioned));
      return {
        runId: run.id,
        createdAt: run.createdAt,
        status: run.status,
        visibilityCombined: promptIds.length > 0 ? mentioned.length / promptIds.length : null,
        engines: GEO_ENGINES.filter((e) => run.engines?.[e]).map((engine) => {
          const engineRows = rows.filter((r) => r.engine === engine);
          const m = engineRows.filter((r) => r.brandMentioned).length;
          return { engine, visibility: engineRows.length > 0 ? m / engineRows.length : null };
        }),
      };
    })
    .reverse(); // chronological for sparklines
}

// ---------------------------------------------------------------------------
// Content briefs (stateless generation — nothing stored in Phase 1)
// ---------------------------------------------------------------------------

const geoBriefSchema = z.object({
  title: z.string().min(1),
  outline: z.array(z.string().min(1)).min(1),
  target_queries: z.array(z.string().min(1)).min(1),
});
export type GeoBrief = z.infer<typeof geoBriefSchema>;

/**
 * Generate a content brief to close a visibility gap (brand absent where
 * competitors are cited). Stateless — nothing is stored in Phase 1.
 */
export async function generateGeoBrief(
  ctx: AgentContext,
  input: { promptId: string },
  opts: { clients?: GeoEngineClients; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
): Promise<GeoBrief> {
  if (!(await isWithinBudget(ctx))) {
    throw new Error('Monthly AI budget reached — brief generation is paused until next month.');
  }
  const parser = opts.clients?.parser ?? createGeoEngineClients(opts.env ?? process.env, opts.fetchImpl).parser;
  if (!parser) throw new Error('Brief generation unavailable: DEEPSEEK_API_KEY is not configured.');

  const [prompt] = await ctx.db
    .select()
    .from(geoPrompts)
    .where(and(eq(geoPrompts.id, input.promptId), eq(geoPrompts.orgId, ctx.orgId)))
    .limit(1);
  if (!prompt) throw new Error('Prompt not found');

  const brand = await getGeoBrandInfo(ctx);
  const run = await latestRun(ctx);
  let gapContext = '';
  if (run) {
    const [result] = await ctx.db
      .select()
      .from(geoResults)
      .where(and(eq(geoResults.runId, run.id), eq(geoResults.promptId, prompt.id)))
      .orderBy(asc(geoResults.createdAt))
      .limit(2);
    if (result) {
      const comps = (result.competitorMentions ?? []).map((m) => m.name).join(', ');
      const domains = [...new Set((result.citations ?? []).map((c) => safeHostname(c.url)).filter(Boolean))].slice(0, 5);
      gapContext = [
        comps ? `Competitors cited instead of the brand: ${comps}.` : '',
        domains.length > 0 ? `Domains the engine trusted: ${domains.join(', ')}.` : '',
        result.answerExcerpt ? `Engine answer excerpt: ${result.answerExcerpt}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a content strategist. Help brands get cited by AI engines (GEO / generative engine optimization). Respond with a single JSON object only — no prose, no markdown fences.',
    },
    {
      role: 'user',
      content: [
        `Brand: "${brand.name}"${brand.domain ? ` (${brand.domain})` : ''}`,
        `Question where the brand is missing from AI answers: "${prompt.text}"`,
        gapContext,
        '',
        'Write a content brief that would make the brand the natural citation for this question.',
        'Return JSON with exactly these keys:',
        '{',
        '  "title": string, // working title of the content piece',
        '  "outline": string[], // 4-7 section bullets',
        '  "target_queries": string[] // 3-6 questions this content should answer for AI engines',
        '}',
      ].join('\n'),
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await parser.chat(messages, { temperature: 0.4, maxTokens: 900 });
    if (res.usage) await recordUsage(ctx, res.usage).catch(() => {});
    try {
      return geoBriefSchema.parse(parseStrictJson(res.content));
    } catch {
      messages.push({ role: 'assistant', content: res.content });
      messages.push({
        role: 'user',
        content: 'That was not valid. Reply with ONLY the JSON object described above — no other text.',
      });
    }
  }
  throw new Error('Brief generation failed — the model did not return valid JSON.');
}

// ---------------------------------------------------------------------------
// Batch runner (worker geo-scan queue + cron)
// ---------------------------------------------------------------------------

export interface GeoScansRun {
  orgs: number;
  scanned: number;
  skipped: number;
  errors: string[];
}

/** Scan every org; per-org failures are collected, never thrown (mirrors runWeeklyReportsForAllOrgs). */
export async function runGeoScansForAllOrgs(
  db: Db,
  opts: GeoScanOptions = {},
): Promise<GeoScansRun> {
  const orgs = await db.select({ id: organizations.id }).from(organizations);
  const run: GeoScansRun = { orgs: orgs.length, scanned: 0, skipped: 0, errors: [] };

  for (const org of orgs) {
    const ctx = createAgentContext({ db, orgId: org.id });
    try {
      const outcome = await runGeoScan(ctx, { ...opts, trigger: opts.trigger ?? 'scheduled' });
      if (outcome.status === 'run') run.scanned += 1;
      else run.skipped += 1;
    } catch (err) {
      run.errors.push(`${org.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return run;
}

// GEO / AI Visibility service tests: mocked engine responses only — the
// honesty rail forbids simulated data in production, but unit tests inject
// fake providers to verify parsing, failure isolation, and metering.
//
// Engines run concurrently, so fake providers respond based on the request
// content (prompt text / answer) rather than call order.

import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { competitors, contentPieces, geoResults, geoRuns, llmUsage } from '@growthcrew/db';
import type { ChatMessage, LLMProvider, LLMResponse } from '@growthcrew/llm';
import {
  addPrompt,
  extractInlineCitations,
  generateGeoBrief,
  GEO_MAX_ACTIVE_PROMPTS,
  GeoPromptLimitError,
  getHistory,
  getLatestSummary,
  listPrompts,
  parseStrictJson,
  removePrompt,
  runGeoScan,
  runGeoScansForAllOrgs,
  updatePrompt,
  type GeoEngineClients,
} from '../src/services/geo.js';
import { db, freshOrg, truncateAll } from './helpers.js';

/** Provider whose reply is a function of the request messages. */
function scripted(name: string, responder: (messages: ChatMessage[]) => LLMResponse) {
  const requests: ChatMessage[][] = [];
  const provider: LLMProvider = {
    name,
    async chat(messages: ChatMessage[]): Promise<LLMResponse> {
      requests.push([...messages]);
      return responder([...messages]);
    },
  };
  return { provider, requests };
}

/** Provider that hangs forever — exercises the engine timeout path. */
function hanging(name: string): LLMProvider {
  return { name, chat: () => new Promise<LLMResponse>(() => {}) };
}

const userText = (messages: ChatMessage[]) =>
  messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');

function parseJson(overrides: Partial<Record<string, unknown>> = {}): LLMResponse {
  return {
    content: JSON.stringify({
      brand_mentioned: true,
      brand_rank: 1,
      competitor_mentions: [{ name: 'Rival Tools', count: 2 }],
      sentiment: 'positive',
      ...overrides,
    }),
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  };
}

/** Parser that decides from the answer embedded in its own request. */
function smartParser() {
  return scripted('parser', (messages) => {
    const text = userText(messages);
    const answer = text.split('Engine answer:')[1]?.split('Return JSON')[0] ?? '';
    const mentioned = answer.includes('Test Business');
    return parseJson(
      mentioned
        ? {}
        : {
            brand_mentioned: false,
            brand_rank: null,
            sentiment: null,
            competitor_mentions: [{ name: 'Rival Tools', count: 1 }],
          },
    );
  });
}

const SONAR_ANSWER =
  'Test Business is a great fit for small teams [Review](https://reviews.example.com/test-business). ' +
  'Rival Tools also comes up [Rival](https://rival.example.com/home). See https://listing.example.com/top-tools.';
const GEMINI_ANSWER =
  'Based on current sources, Test Business ranks highly for this need, while Rival Tools is an alternative.';

describe('geo prompt CRUD', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('adds, lists in position order, updates, and deactivates prompts', async () => {
    const org = await freshOrg();
    const first = await addPrompt(org.ctx, { text: 'Best CRM for bakeries?' });
    const second = await addPrompt(org.ctx, { text: 'Top marketing tools?', category: 'marketing' });

    const rows = await listPrompts(org.ctx);
    expect(rows.map((r) => r.text)).toEqual(['Best CRM for bakeries?', 'Top marketing tools?']);
    expect(rows[0]!.position).toBe(0);
    expect(rows[1]!.position).toBe(1);
    expect(rows[1]!.category).toBe('marketing');

    await updatePrompt(org.ctx, first.id, { text: 'Updated?', active: false });
    const active = await listPrompts(org.ctx, { activeOnly: true });
    expect(active.map((r) => r.id)).toEqual([second.id]);

    await removePrompt(org.ctx, second.id);
    expect(await listPrompts(org.ctx, { activeOnly: true })).toHaveLength(0);
  });

  it('rejects the 61st active prompt with a clear error (cost ceiling)', async () => {
    const org = await freshOrg();
    for (let i = 0; i < GEO_MAX_ACTIVE_PROMPTS; i++) {
      await addPrompt(org.ctx, { text: `Prompt ${i + 1}` });
    }
    await expect(addPrompt(org.ctx, { text: 'One too many' })).rejects.toThrow(GeoPromptLimitError);
    await expect(addPrompt(org.ctx, { text: 'One too many' })).rejects.toThrow(/60/);
    expect((await listPrompts(org.ctx, { activeOnly: true })).length).toBe(GEO_MAX_ACTIVE_PROMPTS);
  });

  it('frees a slot on deactivation; reactivation counts against the cap again', async () => {
    const org = await freshOrg();
    for (let i = 0; i < GEO_MAX_ACTIVE_PROMPTS; i++) {
      await addPrompt(org.ctx, { text: `Prompt ${i + 1}` });
    }
    const rows = await listPrompts(org.ctx, { activeOnly: true });
    await removePrompt(org.ctx, rows[0]!.id);
    const added = await addPrompt(org.ctx, { text: 'Replacement prompt' });
    expect(added.text).toBe('Replacement prompt');
    await expect(updatePrompt(org.ctx, rows[0]!.id, { active: true })).rejects.toThrow(
      GeoPromptLimitError,
    );
  });
});

describe('extractInlineCitations / parseStrictJson', () => {
  it('pulls markdown links and bare URLs, deduped', () => {
    const got = extractInlineCitations(
      'See [A](https://a.com/x) and [1](https://b.com) plus https://a.com/x and https://c.com.',
    );
    expect(got).toEqual([
      { title: 'A', url: 'https://a.com/x' },
      { url: 'https://b.com' },
      { url: 'https://c.com' },
    ]);
  });

  it('tolerates fences and prose around JSON', () => {
    expect(parseStrictJson('Sure! ```json\n{"a":1}\n``` hope that helps')).toEqual({ a: 1 });
    expect(() => parseStrictJson('no json here')).toThrow();
  });
});

describe('runGeoScan', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('queries every prompt x engine, stores real parsed rows, and aggregates', async () => {
    // freshOrg names the org "Test Business" — the brand the parser looks for.
    const org = await freshOrg();
    // A known competitor from the existing competitors module — mention
    // matching must reuse it, not a parallel registry.
    await db.insert(competitors).values({
      orgId: org.orgId,
      url: 'https://rivaltools.example.com',
      name: 'Rival Tools',
    });
    await addPrompt(org.ctx, { text: 'Best tool for X?' });
    await addPrompt(org.ctx, { text: 'Cheapest tool for X?' });

    const perplexity = scripted('perplexity', (messages) => {
      const q = userText(messages);
      if (q.includes('Best tool')) return { content: SONAR_ANSWER, usage: { promptTokens: 800, completionTokens: 400, totalTokens: 1200 } };
      return { content: 'Rival Tools is the usual pick here [R](https://rival.example.com).', usage: { promptTokens: 800, completionTokens: 300, totalTokens: 1100 } };
    });
    const gemini = scripted('gemini', (messages) => {
      const q = userText(messages);
      if (q.includes('Best tool'))
        return {
          content: GEMINI_ANSWER,
          usage: { promptTokens: 700, completionTokens: 300, totalTokens: 1000 },
          groundingCitations: [{ title: 'Source', url: 'https://grounded.example.com/article' }],
        };
      return {
        content: 'Rival Tools again for the cheap option.',
        usage: { promptTokens: 700, completionTokens: 250, totalTokens: 950 },
        groundingCitations: [{ url: 'https://grounded.example.com/cheap' }],
      };
    });
    const parser = smartParser();

    const clients: GeoEngineClients = {
      perplexity: perplexity.provider,
      gemini: gemini.provider,
      parser: parser.provider,
    };
    const outcome = await runGeoScan(org.ctx, { clients, trigger: 'manual' });
    expect(outcome.status).toBe('run');
    if (outcome.status !== 'run') return;
    expect(outcome.run.status).toBe('done');
    expect(outcome.run.engines).toEqual({ perplexity: { status: 'ok' }, gemini: { status: 'ok' } });

    const results = await db.select().from(geoResults).where(eq(geoResults.runId, outcome.run.id));
    expect(results).toHaveLength(4); // 2 prompts x 2 engines

    const sonarP1 = results.find((r) => r.engine === 'perplexity' && r.answerExcerpt?.includes('great fit'));
    expect(sonarP1).toBeDefined();
    expect(sonarP1!.brandMentioned).toBe(true);
    expect(sonarP1!.brandRank).toBe(1);
    expect(sonarP1!.sentiment).toBe('positive');
    expect(sonarP1!.parseFailed).toBe(false);
    // Sonar citations come from the real markdown links in the answer.
    expect(sonarP1!.citations).toContainEqual({
      title: 'Review',
      url: 'https://reviews.example.com/test-business',
    });
    expect(sonarP1!.citations).toContainEqual({ url: 'https://listing.example.com/top-tools' });
    // Competitor mention normalized to the org's competitor registry name.
    expect(sonarP1!.competitorMentions).toEqual([{ name: 'Rival Tools', count: 2 }]);

    const geminiP1 = results.find((r) => r.engine === 'gemini' && r.answerExcerpt?.includes('ranks highly'));
    // Gemini citations come from grounding metadata, not text parsing.
    expect(geminiP1!.citations).toEqual([{ title: 'Source', url: 'https://grounded.example.com/article' }]);

    const summary = await getLatestSummary(org.ctx);
    expect(summary).not.toBeNull();
    // Prompt 1 mentioned in both engines, prompt 2 in none → combined 0.5.
    expect(summary!.visibilityCombined).toBeCloseTo(0.5);
    expect(summary!.brandMentions).toBe(2);
    // brand mentions 2; competitor counts 2+2 (prompt1 both engines) + 1+1 (prompt2) = 6 → 2/8
    expect(summary!.shareOfVoice).toBeCloseTo(2 / 8);
    expect(summary!.engines).toEqual([
      { engine: 'perplexity', status: 'ok', error: undefined, prompts: 2, mentions: 1, visibility: 0.5 },
      { engine: 'gemini', status: 'ok', error: undefined, prompts: 2, mentions: 1, visibility: 0.5 },
    ]);

    // Metering: every engine + parser call with usage hit the org's llm_usage rollup.
    // 4 engine calls (2 prompts x 2 engines) + 4 parses (one per answer) = 8.
    const [usage] = await db.select().from(llmUsage).where(eq(llmUsage.orgId, org.orgId));
    expect(usage).toBeDefined();
    expect(usage!.requestCount).toBe(8);
    expect(usage!.totalTokens).toBeGreaterThan(0);

    const history = await getHistory(org.ctx);
    expect(history).toHaveLength(1);
    expect(history[0]!.visibilityCombined).toBeCloseTo(0.5);
  });

  it('stores a parse_failed row with nulls after two invalid parser responses', async () => {
    const org = await freshOrg();
    await addPrompt(org.ctx, { text: 'Best tool for X?' });

    const clients: GeoEngineClients = {
      perplexity: scripted('perplexity', () => ({ content: SONAR_ANSWER })).provider,
      gemini: undefined,
      parser: scripted('parser', () => ({ content: 'I cannot output JSON, sorry!' })).provider,
    };

    const outcome = await runGeoScan(org.ctx, { clients });
    expect(outcome.status).toBe('run');
    if (outcome.status !== 'run') return;
    expect(outcome.run.status).toBe('done'); // engine worked → run completes
    expect(outcome.run.engines.perplexity?.status).toBe('ok');
    // Gemini was never queried (no client) → failed/not-configured, never "tracked".
    expect(outcome.run.engines.gemini).toEqual({
      status: 'failed',
      error: 'engine not configured (missing API key)',
    });

    const [row] = await db.select().from(geoResults).where(eq(geoResults.runId, outcome.run.id));
    expect(row!.parseFailed).toBe(true);
    expect(row!.brandMentioned).toBe(false);
    expect(row!.brandRank).toBeNull();
    expect(row!.sentiment).toBeNull();
    expect(row!.competitorMentions).toEqual([]);
    // The real answer excerpt is still stored.
    expect(row!.answerExcerpt).toContain('Test Business');
  });

  it('marks a timing-out engine failed and completes the run with the other engine', async () => {
    const org = await freshOrg();
    await addPrompt(org.ctx, { text: 'Best tool for X?' });
    await addPrompt(org.ctx, { text: 'Another question?' });

    const clients: GeoEngineClients = {
      perplexity: hanging('perplexity'), // never answers
      gemini: scripted('gemini', () => ({ content: GEMINI_ANSWER })).provider,
      parser: smartParser().provider,
    };

    const outcome = await runGeoScan(org.ctx, { clients, timeoutMs: 60 });
    expect(outcome.status).toBe('run');
    if (outcome.status !== 'run') return;

    expect(outcome.run.status).toBe('done');
    expect(outcome.run.engines.perplexity?.status).toBe('failed');
    expect(outcome.run.engines.perplexity?.error).toMatch(/timed out after 60ms/);
    expect(outcome.run.engines.gemini).toEqual({ status: 'ok' });

    const results = await db.select().from(geoResults).where(eq(geoResults.runId, outcome.run.id));
    // Only gemini rows — the timed-out engine stored nothing (no fake data).
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.engine === 'gemini')).toBe(true);

    const summary = await getLatestSummary(org.ctx);
    expect(summary!.engines.map((e) => e.engine)).toEqual(['perplexity', 'gemini']);
    expect(summary!.engines[0]!.visibility).toBeNull(); // failed engine → no data
    expect(summary!.engines[1]!.visibility).toBe(1);
  });

  it('fails the run (not aborts) when every engine errors', async () => {
    const org = await freshOrg();
    await addPrompt(org.ctx, { text: 'Best tool for X?' });

    const exploding: LLMProvider = {
      name: 'perplexity',
      chat: async () => {
        throw new Error('401 invalid api key');
      },
    };
    const outcome = await runGeoScan(org.ctx, {
      clients: { perplexity: exploding, gemini: undefined, parser: smartParser().provider },
    });
    expect(outcome.status).toBe('run');
    if (outcome.status !== 'run') return;
    expect(outcome.run.status).toBe('failed');
    expect(outcome.run.error).toContain('perplexity: 401 invalid api key');
    const results = await db.select().from(geoResults).where(eq(geoResults.runId, outcome.run.id));
    expect(results).toHaveLength(0); // nothing queried → nothing stored
  });

  it('overrides a claimed brand mention the answer text does not support (honesty backstop)', async () => {
    const org = await freshOrg();
    await addPrompt(org.ctx, { text: 'Best tool for X?' });

    const clients: GeoEngineClients = {
      perplexity: scripted('perplexity', () => ({ content: 'Only Rival Tools is worth considering here.' }))
        .provider,
      gemini: undefined,
      // Parser falsely claims the brand is mentioned.
      parser: scripted('parser', () => parseJson()).provider,
    };

    const outcome = await runGeoScan(org.ctx, { clients });
    if (outcome.status !== 'run') throw new Error('expected run');
    const [row] = await db.select().from(geoResults).where(eq(geoResults.runId, outcome.run.id));
    expect(row!.brandMentioned).toBe(false);
    expect(row!.brandRank).toBeNull();
    expect(row!.sentiment).toBeNull();
  });

  it('drops competitor mentions that are not in the org competitor registry', async () => {
    const org = await freshOrg();
    await addPrompt(org.ctx, { text: 'Best tool for X?' });

    const clients: GeoEngineClients = {
      perplexity: scripted('perplexity', () => ({ content: 'Test Business is here.' })).provider,
      gemini: undefined,
      parser: scripted('parser', () =>
        parseJson({
          competitor_mentions: [
            { name: 'Some Unknown Corp', count: 3 },
            { name: 'Zero Count', count: 0 },
          ],
        }),
      ).provider,
    };

    const outcome = await runGeoScan(org.ctx, { clients });
    if (outcome.status !== 'run') throw new Error('expected run');
    const [row] = await db.select().from(geoResults).where(eq(geoResults.runId, outcome.run.id));
    expect(row!.competitorMentions).toEqual([]);
  });

  it('skips orgs with no active prompts without creating a run row', async () => {
    const org = await freshOrg();
    const outcome = await runGeoScan(org.ctx, { clients: {} });
    expect(outcome).toEqual({ status: 'skipped', reason: 'no-prompts' });
    expect(await db.select().from(geoRuns)).toHaveLength(0);
  });

  it('refuses to scan when the org is over its monthly LLM budget', async () => {
    const org = await freshOrg({ settings: { llmBudgetCents: 0 } });
    await addPrompt(org.ctx, { text: 'Best tool for X?' });
    const outcome = await runGeoScan(org.ctx, {
      clients: { perplexity: scripted('p', () => ({ content: 'x' })).provider },
    });
    expect(outcome).toEqual({ status: 'budget_exceeded' });
    expect(await db.select().from(geoRuns)).toHaveLength(0);
  });

  it('requires a parser (DeepSeek) even when engines are configured', async () => {
    const org = await freshOrg();
    await addPrompt(org.ctx, { text: 'Best tool for X?' });
    await expect(
      runGeoScan(org.ctx, {
        clients: { perplexity: scripted('p', () => ({ content: 'x' })).provider, parser: undefined },
      }),
    ).rejects.toThrow(/DEEPSEEK_API_KEY/);
  });

  it('keeps one run row per scan; history comes back chronological', async () => {
    const org = await freshOrg();
    await addPrompt(org.ctx, { text: 'Best tool for X?' });
    const clients: GeoEngineClients = {
      perplexity: scripted('perplexity', () => ({ content: 'Test Business wins.' })).provider,
      gemini: undefined,
      parser: smartParser().provider,
    };

    await runGeoScan(org.ctx, { clients });
    await runGeoScan(org.ctx, { clients });

    const runs = await db.select().from(geoRuns).where(eq(geoRuns.orgId, org.orgId));
    expect(runs).toHaveLength(2);

    const history = await getHistory(org.ctx);
    expect(history).toHaveLength(2);
    expect(history[0]!.createdAt.getTime()).toBeLessThanOrEqual(history[1]!.createdAt.getTime());
  });
});

describe('runGeoScansForAllOrgs (worker entry point)', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('scans every org with prompts, skips those without, and isolates errors', async () => {
    // Two orgs with a tracked prompt each, one org with none.
    const orgA = await freshOrg();
    const orgB = await freshOrg();
    const orgEmpty = await freshOrg();
    await addPrompt(orgA.ctx, { text: 'Best tool for X?' });
    await addPrompt(orgB.ctx, { text: 'Best tool for Y?' });

    const clients: GeoEngineClients = {
      perplexity: scripted('perplexity', () => ({ content: 'Test Business is the pick.' })).provider,
      gemini: undefined,
      parser: smartParser().provider,
    };

    const run = await runGeoScansForAllOrgs(db, { clients });
    expect(run.orgs).toBe(3);
    expect(run.scanned).toBe(2); // orgA + orgB
    expect(run.skipped).toBe(1); // orgEmpty has no prompts
    expect(run.errors).toEqual([]);

    // A done run + stored results for each scanned org.
    for (const org of [orgA, orgB]) {
      const runs = await db.select().from(geoRuns).where(eq(geoRuns.orgId, org.orgId));
      expect(runs).toHaveLength(1);
      expect(runs[0]!.status).toBe('done');
      expect(runs[0]!.trigger).toBe('scheduled');
      const results = await db.select().from(geoResults).where(eq(geoResults.runId, runs[0]!.id));
      expect(results.length).toBeGreaterThan(0);
    }
    expect(await db.select().from(geoRuns).where(eq(geoRuns.orgId, orgEmpty.orgId))).toHaveLength(0);
  });

  it('collects per-org errors without sinking the batch', async () => {
    const orgA = await freshOrg();
    const orgB = await freshOrg();
    await addPrompt(orgA.ctx, { text: 'Best tool for X?' });
    await addPrompt(orgB.ctx, { text: 'Best tool for Y?' });

    // Engine errors are isolated inside a run (fail-fast), so the batch-level
    // hard error is a missing parser: every org with prompts fails the same way
    // and the error is collected, not thrown.
    const run = await runGeoScansForAllOrgs(db, {
      clients: {
        perplexity: scripted('perplexity', () => ({ content: 'Test Business is the pick.' })).provider,
        parser: undefined,
      },
    });
    expect(run.orgs).toBe(2);
    expect(run.scanned).toBe(0);
    expect(run.errors).toHaveLength(2);
    for (const err of run.errors) expect(err).toContain('DEEPSEEK_API_KEY');
  });
});

describe('generateGeoBrief', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('returns a validated brief and stores nothing (stateless)', async () => {
    const org = await freshOrg();
    const prompt = await addPrompt(org.ctx, { text: 'Best tool for X?' });

    const parser = scripted('parser', () => ({
      content: JSON.stringify({
        title: 'Why Test Business fits X',
        outline: ['Intro', 'Comparison', 'FAQ'],
        target_queries: ['Best tool for X?', 'Test Business review'],
      }),
      usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
    })).provider;

    const brief = await generateGeoBrief(org.ctx, { promptId: prompt.id }, { clients: { parser } });
    expect(brief.title).toBe('Why Test Business fits X');
    expect(brief.outline).toHaveLength(3);
    expect(brief.target_queries).toContain('Best tool for X?');

    // Stateless: no content_pieces or other rows written.
    expect(await db.select().from(contentPieces)).toHaveLength(0);
  });

  it('rejects when the org is over budget', async () => {
    const org = await freshOrg({ settings: { llmBudgetCents: 0 } });
    const prompt = await addPrompt(org.ctx, { text: 'Best tool for X?' });
    await expect(
      generateGeoBrief(org.ctx, { promptId: prompt.id }, { clients: { parser: smartParser().provider } }),
    ).rejects.toThrow(/budget/i);
  });
});

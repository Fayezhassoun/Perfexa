// Content plans + authority targets (Visibility Phase 2 Features 2 & 3).
// Plans are built from stored geo_results only — the brand-absent prompts
// become idea rows, and generation is idempotent per (prompt, horizon).

import { beforeEach, describe, expect, it } from 'vitest';
import { contentPlans, geoResults, geoRuns } from '@growthcrew/db';
import type { LLMProvider, LLMResponse } from '@growthcrew/llm';
import { addPrompt, getAuthorityTargets } from '../src/services/geo.js';
import {
  ContentPlanTransitionError,
  generateContentPlans,
  getGapPrompts,
  listContentPlans,
  updateContentPlan,
} from '../src/services/geo-plans.js';
import { db, freshOrg, truncateAll } from './helpers.js';

function briefParser(): LLMProvider {
  return {
    name: 'parser',
    async chat(): Promise<LLMResponse> {
      return {
        content: JSON.stringify({
          title: 'Close the gap',
          outline: ['Intro', 'Proof', 'FAQ'],
          target_queries: ['best tool for x?'],
        }),
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    },
  };
}

async function seedRun(orgId: string) {
  const [run] = await db
    .insert(geoRuns)
    .values({ orgId, status: 'done', trigger: 'scheduled', engines: { perplexity: { status: 'ok' } } })
    .returning();
  return run!;
}

async function seedResult(opts: {
  runId: string;
  promptId: string;
  brandMentioned: boolean;
  citations?: { title?: string; url: string }[];
  competitorMentions?: { name: string; count: number }[];
}) {
  const [row] = await db
    .insert(geoResults)
    .values({
      runId: opts.runId,
      promptId: opts.promptId,
      engine: 'perplexity',
      brandMentioned: opts.brandMentioned,
      answerExcerpt: 'excerpt',
      citations: opts.citations ?? [],
      competitorMentions: opts.competitorMentions ?? [],
    })
    .returning();
  return row!;
}

describe('getGapPrompts', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('returns only prompts the brand is absent from; prompts with no results are not gaps', async () => {
    const org = await freshOrg();
    const mentioned = await addPrompt(org.ctx, { text: 'Where we win?' });
    const gap = await addPrompt(org.ctx, { text: 'Where we are missing?' });
    const noData = await addPrompt(org.ctx, { text: 'Never scanned?' });
    const run = await seedRun(org.orgId);
    await seedResult({ runId: run.id, promptId: mentioned.id, brandMentioned: true });
    await seedResult({ runId: run.id, promptId: gap.id, brandMentioned: false });

    const gaps = await getGapPrompts(org.ctx, run);
    expect(gaps.map((g) => g.prompt.id)).toEqual([gap.id]);
    expect(gaps.map((g) => g.prompt.id)).not.toContain(noData.id);
  });
});

describe('generateContentPlans', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('creates one idea plan per gap prompt and none for mentioned prompts', async () => {
    const org = await freshOrg();
    const mentioned = await addPrompt(org.ctx, { text: 'Where we win?' });
    const gap = await addPrompt(org.ctx, { text: 'Where we are missing?' });
    const run = await seedRun(org.orgId);
    await seedResult({ runId: run.id, promptId: mentioned.id, brandMentioned: true });
    await seedResult({ runId: run.id, promptId: gap.id, brandMentioned: false });

    const result = await generateContentPlans(org.ctx, { clients: { parser: briefParser() } });
    expect(result.runId).toBe(run.id);
    expect(result.gaps).toBe(1);
    expect(result.created).toHaveLength(1);
    expect(result.skippedExisting).toBe(0);

    const plan = result.created[0]!;
    expect(plan.promptId).toBe(gap.id);
    expect(plan.status).toBe('idea');
    expect(plan.title).toBe('Close the gap');
    expect([30, 60, 90]).toContain(plan.horizon);
    expect(plan.brief?.outline).toEqual(['Intro', 'Proof', 'FAQ']);
    expect(plan.dueDate).toBeInstanceOf(Date);

    const rows = await db.select().from(contentPlans);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.promptId).toBe(gap.id);
    expect(rows[0]!.promptId).not.toBe(mentioned.id);
  });

  it('is idempotent: a second run adds nothing for the same prompt+horizon', async () => {
    const org = await freshOrg();
    const gap = await addPrompt(org.ctx, { text: 'Where we are missing?' });
    const run = await seedRun(org.orgId);
    await seedResult({ runId: run.id, promptId: gap.id, brandMentioned: false });

    const first = await generateContentPlans(org.ctx, { clients: { parser: briefParser() } });
    expect(first.created).toHaveLength(1);

    const second = await generateContentPlans(org.ctx, { clients: { parser: briefParser() } });
    expect(second.created).toHaveLength(0);
    expect(second.skippedExisting).toBe(1);
    expect(second.gaps).toBe(1);

    const rows = await db.select().from(contentPlans);
    expect(rows).toHaveLength(1); // no duplicates
  });

  it('throws when there is no GEO run yet', async () => {
    const org = await freshOrg();
    await expect(generateContentPlans(org.ctx)).rejects.toThrow(/run a scan/i);
  });

  it('creates nothing when there are no gaps (brand cited everywhere)', async () => {
    const org = await freshOrg();
    const mentioned = await addPrompt(org.ctx, { text: 'Where we win?' });
    const run = await seedRun(org.orgId);
    await seedResult({ runId: run.id, promptId: mentioned.id, brandMentioned: true });

    const result = await generateContentPlans(org.ctx, { clients: { parser: briefParser() } });
    expect(result.gaps).toBe(0);
    expect(result.created).toHaveLength(0);
    expect(await db.select().from(contentPlans)).toHaveLength(0);
  });
});

describe('listContentPlans / updateContentPlan', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('lists plans with the gap prompt text and advances status forward-only', async () => {
    const org = await freshOrg();
    const gap = await addPrompt(org.ctx, { text: 'Where we are missing?' });
    const run = await seedRun(org.orgId);
    await seedResult({ runId: run.id, promptId: gap.id, brandMentioned: false });
    await generateContentPlans(org.ctx, { clients: { parser: briefParser() } });

    const plans = await listContentPlans(org.ctx);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.promptText).toBe('Where we are missing?');

    const plan = plans[0]!;
    const approved = await updateContentPlan(org.ctx, plan.id, { status: 'approved' });
    expect(approved.status).toBe('approved');
    const drafted = await updateContentPlan(org.ctx, plan.id, { status: 'drafted' });
    expect(drafted.status).toBe('drafted');
    const published = await updateContentPlan(org.ctx, plan.id, { status: 'published' });
    expect(published.status).toBe('published');

    // Backwards (or sideways) moves are rejected.
    await expect(updateContentPlan(org.ctx, plan.id, { status: 'idea' })).rejects.toThrow(
      ContentPlanTransitionError,
    );
    await expect(updateContentPlan(org.ctx, plan.id, { status: 'published' })).rejects.toThrow(
      /forward only/i,
    );
  });

  it('rejects unknown plans and unknown statuses at the service boundary', async () => {
    const org = await freshOrg();
    await expect(updateContentPlan(org.ctx, '00000000-0000-0000-0000-000000000000', { status: 'approved' })).rejects.toThrow(
      /not found/i,
    );
  });
});

describe('getAuthorityTargets', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('derives competitor-citing domains that never cite the brand; drops its own domain', async () => {
    // Brand domain from websiteUrl: example.com (freshOrg default).
    const org = await freshOrg();
    const prompt = await addPrompt(org.ctx, { text: 'Best tool for X?' });
    const run = await seedRun(org.orgId);

    // Row where the brand IS mentioned: citations include forbes + own blog.
    await seedResult({
      runId: run.id,
      promptId: prompt.id,
      brandMentioned: true,
      citations: [
        { title: 'Forbes', url: 'https://www.forbes.com/best' },
        { title: 'Our blog', url: 'https://blog.example.com/post' },
      ],
      competitorMentions: [{ name: 'Rival', count: 1 }],
    });
    // Row where the brand is ABSENT: a competitor-only roundup cites rival.com.
    await seedResult({
      runId: run.id,
      promptId: prompt.id,
      brandMentioned: false,
      citations: [
        { title: 'Rival', url: 'https://rival.example.net/compare' },
        { title: 'Forbes', url: 'https://www.forbes.com/best' }, // also cites brand elsewhere → excluded
      ],
      competitorMentions: [{ name: 'Rival', count: 2 }],
    });

    const { runId, targets } = await getAuthorityTargets(org.ctx);
    expect(runId).toBe(run.id);
    const domains = targets.map((t) => t.domain);
    // rival.example.net cites a competitor and never the brand → a target.
    expect(domains).toContain('rival.example.net');
    // forbes.com appears in a brand-mentioned row → not a target.
    expect(domains).not.toContain('forbes.com');
    // Our own (sub)domain is never a target.
    expect(domains.some((d) => d.endsWith('example.com'))).toBe(false);

    const rival = targets.find((t) => t.domain === 'rival.example.net')!;
    expect(rival.competitorsCited).toEqual(['Rival']);
    expect(rival.prompts).toContain('Best tool for X?');
    expect(rival.engines).toContain('perplexity');
  });

  it('resolves domains hidden behind Gemini grounding redirects via the title', async () => {
    const org = await freshOrg();
    const prompt = await addPrompt(org.ctx, { text: 'Best tool for X?' });
    const run = await seedRun(org.orgId);
    await seedResult({
      runId: run.id,
      promptId: prompt.id,
      brandMentioned: false,
      citations: [
        {
          title: 'techradar.com',
          url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/OPAQUE==',
        },
      ],
      competitorMentions: [{ name: 'Rival', count: 1 }],
    });

    const { targets } = await getAuthorityTargets(org.ctx);
    expect(targets.map((t) => t.domain)).toEqual(['techradar.com']);
    expect(targets[0]!.sampleUrl).toBe('https://techradar.com');
  });

  it('returns an empty list (not invented targets) before any run exists', async () => {
    const org = await freshOrg();
    await expect(getAuthorityTargets(org.ctx)).resolves.toEqual({ runId: null, targets: [] });
  });
});

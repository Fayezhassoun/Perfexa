// Regression tests for DeepSeek tool-name sanitization (commit 51665dc):
// strict OpenAI-style APIs reject dotted tool names, so internal names like
// "ads.list_campaigns" are sanitized to wire-safe underscore names in the
// request payload and mapped back to the internal names before dispatch.
// This bug was caught in production — these tests keep it from coming back.

import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs } from '@growthcrew/db';
import type { ChatMessage, ChatOptions, LLMProvider, LLMResponse, ToolSpec } from '@growthcrew/llm';
import { handleUserMessage, sanitizeToolName } from '../src/orchestrator.js';
import { getToolsForAgent } from '../src/tools.js';
import { db, freshOrg, truncateAll } from './helpers.js';

const WIRE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

/** Scripted LLM provider that records every request it receives. */
function fakeLLM(responder: (round: number, tools: ToolSpec[]) => LLMResponse) {
  const requests: { messages: ChatMessage[]; tools: ToolSpec[] }[] = [];
  const provider: LLMProvider = {
    name: 'deepseek',
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<LLMResponse> {
      requests.push({ messages: [...messages], tools: opts?.tools ?? [] });
      return responder(requests.length - 1, opts?.tools ?? []);
    },
  };
  return { provider, requests };
}

describe('sanitizeToolName', () => {
  it('turns dotted tool names into underscore-only names', () => {
    expect(sanitizeToolName('ads.list_campaigns')).toBe('ads_list_campaigns');
    expect(sanitizeToolName('seo.run_audit')).toBe('seo_run_audit');
    expect(sanitizeToolName('analytics.get_overview')).toBe('analytics_get_overview');
  });

  it('passes names without dots through unchanged', () => {
    expect(sanitizeToolName('plain_name')).toBe('plain_name');
    expect(sanitizeToolName('name-with-dashes')).toBe('name-with-dashes');
    expect(sanitizeToolName('CamelCase123')).toBe('CamelCase123');
  });

  it('replaces any other wire-unsafe characters', () => {
    expect(sanitizeToolName('tool.name/sub')).toBe('tool_name_sub');
    expect(sanitizeToolName('tool name')).toBe('tool_name');
  });
});

describe('orchestrator LLM tool wiring (DeepSeek wire safety)', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('sends only wire-safe tool names in the request payload', async () => {
    const org = await freshOrg();
    const { provider, requests } = fakeLLM(() => ({ content: 'All set.' }));

    await handleUserMessage({ ...org.ctx, llm: provider }, 'How are my campaigns doing?', 'text');

    expect(requests).toHaveLength(1);
    const wireNames = requests[0]!.tools.map((t) => t.name);
    expect(wireNames.length).toBeGreaterThan(0);

    // Every name on the wire matches the strict API pattern — no dots.
    for (const name of wireNames) {
      expect(name).toMatch(WIRE_NAME_RE);
    }

    // Every orchestrator tool appears under its sanitized alias.
    for (const tool of getToolsForAgent('orchestrator')) {
      expect(wireNames).toContain(sanitizeToolName(tool.name));
    }

    // The dotted internal names never appear on the wire.
    expect(wireNames).toContain('ads_list_campaigns');
    expect(wireNames).not.toContain('ads.list_campaigns');
    expect(wireNames.some((n) => n.includes('.'))).toBe(false);
  });

  it('dispatches model calls made with wire names back to the dotted internal tools', async () => {
    const org = await freshOrg();
    const { provider, requests } = fakeLLM((round) =>
      round === 0
        ? {
            content: '',
            toolCalls: [{ id: 'call_1', name: 'ads_list_campaigns', args: { platform: 'google_ads' } }],
          }
        : { content: 'Done.' },
    );

    const result = await handleUserMessage({ ...org.ctx, llm: provider }, 'List my campaigns', 'text');
    expect(result.assistantMessage).toBe('Done.');

    // The tool executed under its internal dotted name — the audit trail
    // records `tool.<internal name>`, so this proves the wire→internal mapping.
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, org.orgId));
    expect(audits.map((a) => a.action)).toContain('tool.ads.list_campaigns');
    expect(audits.map((a) => a.action)).not.toContain('tool.ads_list_campaigns');

    // The tool result goes back to the model under the wire name, never dotted.
    const toolMessages = requests[1]!.messages.filter((m) => m.role === 'tool');
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0]!.name).toBe('ads_list_campaigns');
  });
});

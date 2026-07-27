// Shared agent-runtime types (CONTRACTS §8).

import type { Db } from '@sayso/db';
import type { LLMProvider } from '@sayso/llm';
import type { z } from 'zod';
import type { AuditLogger } from './audit.js';

export type AgentType =
  | 'orchestrator'
  | 'seo'
  | 'google_ads'
  | 'meta_ads'
  | 'tiktok_ads'
  | 'lead_gen'
  | 'analytics'
  | 'budget_guardian'
  | 'social_media'
  | 'content'
  | 'competitor'
  | 'reputation';

export interface AgentContext {
  db: Db;
  orgId: string;
  userId?: string;
  conversationId?: string;
  llm: LLMProvider;
  audit: AuditLogger;
  /** Injectable clock for tests. */
  now?: Date;
}

export type Intent =
  | 'seo'
  | 'visibility'
  | 'leads'
  | 'ads_google'
  | 'ads_meta'
  | 'ads_tiktok'
  | 'analytics'
  | 'budget_change'
  | 'pause'
  | 'social'
  | 'content'
  | 'competitor'
  | 'reviews';

export interface Question {
  id: string;
  question: string;
  field: string;
}

export interface PlanAgent {
  type: AgentType;
  name: string;
  rationale: string;
  tasks: string[];
}

export interface PlanAction {
  toolName: string;
  args: Record<string, unknown>;
  summary: string;
  gated: true;
}

export interface Plan {
  title: string;
  summary: string;
  businessGoal: 'visibility' | 'leads' | 'sales';
  geography?: string;
  monthlyBudgetCents: number;
  budgetSplit: { platform: 'google_ads' | 'meta' | 'tiktok' | 'reserve'; cents: number }[];
  agents: PlanAgent[];
  actions: PlanAction[];
  timeline: string;
  expectedOutcomes: string[];
}

export interface OrchestratorResult {
  assistantMessage: string;
  proposal?: Plan;
  proposalId?: string;
  proposalApproved?: boolean;
  proposalRejected?: boolean;
  needsClarification?: Question[];
  agentRuns?: string[];
  errors?: string[];
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'completed' | 'failed' | 'awaiting_approval';
  gated: boolean;
  approvalId?: string;
  error?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodType<Record<string, unknown>>;
  gated: boolean;
  execute(ctx: AgentContext, args: Record<string, unknown>): Promise<unknown>;
}

/** Per-conversation orchestrator draft stored in conversations.metadata. */
export interface ConversationDraft {
  intents: Intent[];
  platform: 'google_ads' | 'meta' | 'tiktok';
  auditSummary: {
    url: string;
    score: number;
    mobileSpeed: number;
    missingMeta: number;
    hasLeadForm: boolean;
    isMock: boolean;
  };
  keywords: string[];
  createdAt: string;
}

export interface ConversationMeta {
  draft?: ConversationDraft;
  questionCount?: number;
  [key: string]: unknown;
}

import { pgTable, text, timestamp, integer, uuid, jsonb, unique } from 'drizzle-orm/pg-core';
import { users } from './auth';
import type { Goal } from './enums';

// App tables per CONTRACTS §4. Table names snake_case plural; TS props camelCase.
// Money is integer cents (*Cents). "Enums" are text columns (zod unions in enums.ts).

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  websiteUrl: text('website_url'),
  goals: jsonb('goals').$type<Goal[]>(),
  monthlyBudgetCeilingCents: integer('monthly_budget_ceiling_cents').default(50000),
  onboardingStep: text('onboarding_step').default('welcome'),
  // notifications + agent memory live here (CONTRACTS §5/§8)
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const orgMembers = pgTable(
  'org_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').default('owner'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [unique('org_members_org_user_unique').on(t.orgId, t.userId)],
);

export const connectedAccounts = pgTable('connected_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  platform: text('platform'),
  externalAccountId: text('external_account_id'),
  accessTokenEnc: text('access_token_enc'),
  refreshTokenEnc: text('refresh_token_enc'),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
  mode: text('mode').default('sandbox'),
  scopes: jsonb('scopes').$type<string[]>(),
  status: text('status').default('connected'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const websites = pgTable('websites', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  url: text('url').notNull(),
  lastCrawledAt: timestamp('last_crawled_at', { mode: 'date' }),
  crawl: jsonb('crawl'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  type: text('type'),
  name: text('name'),
  config: jsonb('config').$type<Record<string, unknown>>(),
  status: text('status').default('active'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').references(() => agents.id),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  conversationId: uuid('conversation_id'),
  input: text('input'),
  output: text('output'),
  toolCalls: jsonb('tool_calls').$type<unknown[]>(),
  status: text('status').default('running'),
  error: text('error'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { mode: 'date' }),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  userId: uuid('user_id').references(() => users.id),
  title: text('title'),
  // orchestrator per-conversation state machine draft (CONTRACTS §8 step 4)
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id),
  role: text('role'),
  content: text('content'),
  audioUrl: text('audio_url'),
  transcript: text('transcript'),
  inputModality: text('input_modality').default('text'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const proposals = pgTable('proposals', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),
  plan: jsonb('plan'),
  status: text('status').default('pending'),
  decidedBy: uuid('decided_by'),
  decidedVia: text('decided_via'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  decidedAt: timestamp('decided_at', { mode: 'date' }),
});

export const approvals = pgTable('approvals', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  proposalId: uuid('proposal_id').references(() => proposals.id),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id),
  action: jsonb('action'),
  status: text('status').default('pending'),
  decidedBy: uuid('decided_by'),
  decidedVia: text('decided_via'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  decidedAt: timestamp('decided_at', { mode: 'date' }),
});

export const campaignsMirror = pgTable('campaigns_mirror', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  connectedAccountId: uuid('connected_account_id').references(() => connectedAccounts.id),
  platform: text('platform'),
  externalId: text('external_id'),
  name: text('name'),
  status: text('status').default('active'),
  budgetDailyCents: integer('budget_daily_cents'),
  metrics: jsonb('metrics'),
  mode: text('mode').default('sandbox'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const budgets = pgTable('budgets', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  scope: text('scope'),
  capCents: integer('cap_cents'),
  period: text('period'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const leadForms = pgTable('lead_forms', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name'),
  fields: jsonb('fields').$type<unknown[]>(),
  createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  formId: uuid('form_id').references(() => leadForms.id),
  sourceCampaignId: uuid('source_campaign_id'),
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>(),
  score: integer('score').default(0),
  status: text('status').default('new'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const reports = pgTable('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  type: text('type'),
  content: jsonb('content'),
  periodStart: timestamp('period_start', { mode: 'date' }),
  periodEnd: timestamp('period_end', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  source: text('source'),
  title: text('title'),
  content: text('content'),
  // number[] | null — pgvector in compose, JSONB + JS cosine in embedded dev (§4)
  embedding: jsonb('embedding').$type<number[] | null>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// IMMUTABLE per CONTRACTS §4 — never update/delete; code enforces (no update helpers).
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id'),
  actorType: text('actor_type'),
  actorId: text('actor_id'),
  action: text('action'),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  payloadHash: text('payload_hash'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

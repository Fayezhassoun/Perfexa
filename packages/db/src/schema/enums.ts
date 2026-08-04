import { z } from 'zod';

// Enum values for text columns (CONTRACTS §4: no pg enums — text + zod unions in code).

export const goalSchema = z.enum(['visibility', 'leads', 'sales']);
export type Goal = z.infer<typeof goalSchema>;

export const onboardingStepSchema = z.enum([
  'welcome',
  'business',
  'goals',
  'budget',
  'connect',
  'done',
]);
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

export const orgRoleSchema = z.enum(['owner', 'admin', 'member']);
export type OrgRole = z.infer<typeof orgRoleSchema>;

export const platformSchema = z.enum(['google_ads', 'meta', 'tiktok', 'ga4', 'gsc']);
export type Platform = z.infer<typeof platformSchema>;

export const accountModeSchema = z.enum(['sandbox', 'live']);
export type AccountMode = z.infer<typeof accountModeSchema>;

export const connectedAccountStatusSchema = z.enum(['connected', 'expired', 'revoked']);
export type ConnectedAccountStatus = z.infer<typeof connectedAccountStatusSchema>;

export const agentTypeSchema = z.enum([
  'orchestrator',
  'seo',
  'google_ads',
  'meta_ads',
  'tiktok_ads',
  'lead_gen',
  'analytics',
  'budget_guardian',
]);
export type AgentType = z.infer<typeof agentTypeSchema>;

export const agentStatusSchema = z.enum(['active', 'paused', 'archived']);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const agentRunStatusSchema = z.enum([
  'running',
  'completed',
  'failed',
  'awaiting_approval',
]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const inputModalitySchema = z.enum(['voice', 'text']);
export type InputModality = z.infer<typeof inputModalitySchema>;

export const proposalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'changes_requested',
]);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const approvalStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const decidedViaSchema = z.enum(['voice', 'click']);
export type DecidedVia = z.infer<typeof decidedViaSchema>;

export const campaignStatusSchema = z.enum(['draft', 'active', 'paused', 'removed']);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

export const budgetPeriodSchema = z.enum(['daily', 'monthly']);
export type BudgetPeriod = z.infer<typeof budgetPeriodSchema>;

export const leadFieldTypeSchema = z.enum(['text', 'email', 'phone', 'textarea']);
export type LeadFieldType = z.infer<typeof leadFieldTypeSchema>;

export const leadStatusSchema = z.enum(['new', 'contacted', 'won', 'lost']);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const reportTypeSchema = z.enum(['weekly', 'adhoc']);
export type ReportType = z.infer<typeof reportTypeSchema>;

export const knowledgeSourceSchema = z.enum([
  'google_ads_help',
  'meta_help',
  'tiktok_help',
  'seo_guide',
  'policy',
]);
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

export const actorTypeSchema = z.enum(['user', 'agent', 'system']);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const geoRunStatusSchema = z.enum(['pending', 'running', 'done', 'failed']);
export type GeoRunStatus = z.infer<typeof geoRunStatusSchema>;

export const geoTriggerSchema = z.enum(['scheduled', 'manual']);
export type GeoTrigger = z.infer<typeof geoTriggerSchema>;

export const geoEngineSchema = z.enum(['perplexity', 'gemini']);
export type GeoEngine = z.infer<typeof geoEngineSchema>;

export const geoSentimentSchema = z.enum(['positive', 'neutral', 'negative']);
export type GeoSentiment = z.infer<typeof geoSentimentSchema>;

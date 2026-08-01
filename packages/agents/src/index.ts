// @growthcrew/agents — public surface.

export * from './types.js';
export * from './errors.js';
export { payloadHash, canonicalJson, createAuditLogger, type AuditLogger, type AuditEntry } from './audit.js';
export {
  detectIntents,
  detectGeography,
  detectBudgetAmountCents,
  detectBudgetConfirmation,
  APPROVE_RE,
  REJECT_RE,
} from './intents.js';
export { remember, recall, recallAll, recallString } from './memory.js';
export { createAdapterStore, getOrgAdapter, type MirrorMetrics } from './store.js';
export {
  loadLiveDeps,
  getOrgGscQueries,
  getOrgGa4Traffic,
  oauthClientConfigFor,
  isOAuthConfigured,
  type OAuthClientConfig,
} from './live.js';
export { checkSpend, tick as guardianTick, projectMonthEnd, wouldExceed, type GuardianVerdict } from './guardian.js';
export {
  TOOLS,
  getTool,
  getToolsForAgent,
  executeTool,
  scoreLead,
  type ExecuteToolResult,
} from './tools.js';
export { handleUserMessage } from './orchestrator.js';
export { approveProposal, getOrCreateAgent, type ApproveProposalResult } from './execute-plan.js';
export { runSpecialistAgent, type SpecialistResult } from './specialists.js';
export { createAgentContext, createAgentContextWithOrgLLM } from './context.js';
export * as services from './services/index.js';
export { leadsToCsv } from './services/leads.js';
export type { LeadField } from './services/leads.js';
export type { SendMessageInput, SendMessageResult, ConversationSummary } from './services/conversations.js';
export type { OverviewResult, ActivityItem, SeoTrackerResult } from './services/dashboard.js';
export type { IntegrationStatus, BudgetUpdateResult, MemberRow, InviteMemberResult } from './services/settings.js';
export type { UserOrg, AcceptInviteResult } from './services/orgs.js';
export type { SystemHealth, AdminUserRow } from './services/admin.js';
export type { AuditPage } from './services/audit-log.js';
export { generateCounterCampaign, type CounterCampaignInput, type CounterCampaignResult } from './services/counter-campaign.js';
export {
  detectAnomalies,
  runAnomalyDetection,
  listAlerts,
  acknowledgeAlert,
  type AnomalyAlert,
} from './services/anomaly-detection.js';
export {
  getPortalConfig,
  updatePortalConfig,
  createShareLink,
  listShareLinks,
  revokeShareLink,
  resolvePortal,
  type PortalSummary,
} from './services/portal.js';
export {
  detectCreativeFatigue,
  listFatigueSignals,
  recordCreativeSnapshot,
  type FatigueSignal,
  type FatigueReport,
} from './services/creative-fatigue.js';

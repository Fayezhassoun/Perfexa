// @voxmarketer/agents — public surface.

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

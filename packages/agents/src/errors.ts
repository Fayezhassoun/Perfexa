// Typed errors are defined in @growthcrew/integrations to avoid import cycles
// (CONTRACTS §13). Re-exported here for agent-layer consumers.

export { AdapterError, LiveAdapterNotConnected, ApprovalRequired, BudgetCapExceeded } from '@growthcrew/integrations';

// Typed errors are defined in @sayso/integrations to avoid import cycles
// (CONTRACTS §13). Re-exported here for agent-layer consumers.

export { AdapterError, LiveAdapterNotConnected, ApprovalRequired, BudgetCapExceeded } from '@sayso/integrations';

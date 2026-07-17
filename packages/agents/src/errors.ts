// Typed errors are defined in @voxmarketer/integrations to avoid import cycles
// (CONTRACTS §13). Re-exported here for agent-layer consumers.

export { AdapterError, LiveAdapterNotConnected, ApprovalRequired, BudgetCapExceeded } from '@voxmarketer/integrations';

// Typed errors shared across integrations + agents (CONTRACTS §13).
// Defined here (not in agents) to avoid import cycles. Agents re-export.

export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly platform?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

/** Thrown when a live-mode adapter is used before OAuth is connected (phase 1). */
export class LiveAdapterNotConnected extends AdapterError {
  constructor(platform: string) {
    super(
      `${platform} is in live mode but no account is connected. Connect it in Settings or switch back to sandbox.`,
      platform,
    );
    this.name = 'LiveAdapterNotConnected';
  }
}

/** Thrown by the tool layer when a gated tool runs without an approved approval row. */
export class ApprovalRequired extends Error {
  constructor(
    public readonly toolName: string,
    public readonly summary: string,
  ) {
    super(`Action requires human approval: ${summary}`);
    this.name = 'ApprovalRequired';
  }
}

/** Thrown by the Budget Guardian when a spend action would exceed a cap. */
export class BudgetCapExceeded extends Error {
  constructor(
    public readonly scope: string,
    public readonly capCents: number,
    public readonly attemptedCents: number,
  ) {
    super(
      `Budget cap exceeded for ${scope}: cap ${capCents} cents, attempted ${attemptedCents} cents.`,
    );
    this.name = 'BudgetCapExceeded';
  }
}

// Transactional email delivery (weekly report emails, Phase 3). The provider
// is swappable behind EmailProvider: Resend over HTTP when RESEND_API_KEY is
// configured, otherwise a console fallback that logs and reports success — so
// a missing key never crashes the report flow (CONTRACTS §3 graceful
// degradation). Resend is called via fetch (same convention as the
// @growthcrew/integrations adapters) rather than the npm package, keeping this
// module dependency-free and unit-testable offline.

export interface EmailMessage {
  from: string;
  to: string[];
  subject: string;
  html: string;
}

export type EmailProviderName = 'resend' | 'console';

export interface EmailSendResult {
  id: string;
  provider: EmailProviderName;
}

export interface EmailProvider {
  readonly name: EmailProviderName;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** Minimal fetch shape so the Resend provider is testable without network. */
export interface EmailFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type EmailFetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<EmailFetchResponse>;

export class EmailError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'EmailError';
    this.status = status;
  }
}

const RESEND_URL = 'https://api.resend.com/emails';

/** Resend HTTP API provider. */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend' as const;
  private readonly apiKey: string;
  private readonly fetchImpl: EmailFetchLike;

  constructor(apiKey: string, fetchImpl?: EmailFetchLike) {
    this.apiKey = apiKey;
    const f = fetchImpl ?? (globalThis.fetch as unknown as EmailFetchLike | undefined);
    if (!f) throw new EmailError('No fetch implementation available.');
    this.fetchImpl = f;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    let res: EmailFetchResponse;
    try {
      res = await this.fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: message.from, to: message.to, subject: message.subject, html: message.html }),
      });
    } catch (cause) {
      throw new EmailError(`Could not reach the email service — ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        /* best effort */
      }
      throw new EmailError(`Email service error (HTTP ${res.status})${detail ? `: ${detail}` : ''}`, res.status);
    }
    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new EmailError('Email service did not confirm the send.');
    return { id: data.id, provider: this.name };
  }
}

/** Zero-config dev fallback: logs the email and reports success. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console' as const;
  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.info(
      `[email] no RESEND_API_KEY — log only | to=${message.to.join(', ')} subject="${message.subject}"\n${message.html}`,
    );
    return { id: `console-${Date.now()}`, provider: this.name };
  }
}

export interface EmailProviderOptions {
  fetchImpl?: EmailFetchLike;
}

/** Pick the provider from env: Resend when keyed, console fallback otherwise. */
export function createEmailProvider(
  env: NodeJS.ProcessEnv = process.env,
  opts: EmailProviderOptions = {},
): EmailProvider {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (apiKey) return new ResendEmailProvider(apiKey, opts.fetchImpl);
  return new ConsoleEmailProvider();
}

/** The verified sender address (EMAIL_FROM, with a branded default). */
export function emailFrom(env: NodeJS.ProcessEnv = process.env): string {
  return env.EMAIL_FROM?.trim() || 'GrowthCrew <reports@growthcrew.dev>';
}

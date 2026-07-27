// Transactional email via Resend (Phase 3). Pure adapter: injectable fetch,
// typed errors, no-op friendly — the caller decides what to do without a key.

import { AdapterError } from './errors.js';
import type { FetchLike } from './types.js';

export interface SendEmailInput {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  fetchImpl?: FetchLike;
}

export interface SendEmailResult {
  id: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const f = input.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!f) throw new AdapterError('No fetch implementation available.', 'email');
  let res;
  try {
    res = await f('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${input.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: input.from, to: input.to, subject: input.subject, html: input.html }),
    });
  } catch (cause) {
    throw new AdapterError('Could not reach the email service — check your network connection.', 'email', cause);
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* best effort */
    }
    const err = new AdapterError(`Email service error (HTTP ${res.status}).`, 'email', detail);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new AdapterError('Email service did not confirm the send.', 'email');
  return { id: data.id };
}

// ---------------------------------------------------------------------------
// Weekly report email rendering (deterministic, self-contained HTML).
// ---------------------------------------------------------------------------

export interface WeeklyReportContent {
  summary: string;
  highlights: string[];
  totals?: { spendCents: number; impressions: number; clicks: number; conversions: number };
  periodLabel?: string;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function renderWeeklyReportEmail(orgName: string, content: WeeklyReportContent): string {
  const t = content.totals;
  const rows = t
    ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Spend</td><td><strong>${dollars(t.spendCents)}</strong></td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#666">Impressions</td><td><strong>${t.impressions.toLocaleString('en-US')}</strong></td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#666">Clicks</td><td><strong>${t.clicks.toLocaleString('en-US')}</strong></td></tr>
       <tr><td style="padding:4px 12px 4px 0;color:#666">Conversions</td><td><strong>${t.conversions}</strong></td></tr>`
    : '';
  const highlights = content.highlights.map((h) => `<li style="margin:6px 0">${h}</li>`).join('');
  return `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
  <h1 style="font-size:20px">Your week at ${orgName}</h1>
  <p style="color:#444">${content.summary}</p>
  ${t ? `<table style="border-collapse:collapse;margin:12px 0">${rows}</table>` : ''}
  ${content.highlights.length ? `<h2 style="font-size:15px;margin-top:20px">Highlights</h2><ul style="padding-left:18px">${highlights}</ul>` : ''}
  <p style="color:#888;font-size:12px;margin-top:24px">${content.periodLabel ?? ''} · Sayso — nothing spends without your approval.</p>
</body></html>`;
}

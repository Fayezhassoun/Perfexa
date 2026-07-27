// Resend email adapter (Phase 3): payload mapping, error handling, and the
// deterministic weekly-report renderer — all offline via injected fetch.

import { describe, expect, it } from 'vitest';
import { AdapterError, renderWeeklyReportEmail, sendEmail, type FetchLike } from '../src/index.js';

interface RecordedCall {
  url: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

function fakeFetch(responder: (call: RecordedCall) => { status?: number; body?: unknown }): {
  fetchImpl: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const call = { url, init };
    calls.push(call);
    const { status = 200, body } = responder(call);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { fetchImpl, calls };
}

describe('sendEmail', () => {
  it('posts the Resend payload with the bearer key and maps the id', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: { id: 'msg-1' } }));
    const result = await sendEmail({
      apiKey: 're_key',
      from: 'Sayso <reports@sayso.dev>',
      to: ['owner@test.dev'],
      subject: 'Report',
      html: '<p>hi</p>',
      fetchImpl,
    });

    expect(result).toEqual({ id: 'msg-1' });
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.headers?.authorization).toBe('Bearer re_key');
    const body = JSON.parse(calls[0]!.init?.body ?? '{}') as Record<string, unknown>;
    expect(body).toMatchObject({ from: 'Sayso <reports@sayso.dev>', to: ['owner@test.dev'], subject: 'Report' });
  });

  it('throws AdapterError on HTTP errors', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 422, body: { message: 'invalid to' } }));
    await expect(
      sendEmail({ apiKey: 'k', from: 'a@b.c', to: 'x@y.z', subject: 's', html: 'h', fetchImpl }),
    ).rejects.toBeInstanceOf(AdapterError);
  });

  it('throws when the service does not confirm the send', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: {} }));
    await expect(
      sendEmail({ apiKey: 'k', from: 'a@b.c', to: 'x@y.z', subject: 's', html: 'h', fetchImpl }),
    ).rejects.toThrow(/did not confirm/i);
  });
});

describe('renderWeeklyReportEmail', () => {
  it('renders org name, totals, and highlights into self-contained HTML', () => {
    const html = renderWeeklyReportEmail('Acme Plumbing', {
      summary: 'This week you spent $15.00 for 3 conversions.',
      highlights: ['google_ads brought leads at $5.00 each — your best this week.'],
      totals: { spendCents: 1500, impressions: 1200, clicks: 34, conversions: 3 },
      periodLabel: '2026-07-14 → 2026-07-21',
    });
    expect(html).toContain('Acme Plumbing');
    expect(html).toContain('$15.00');
    expect(html).toContain('1,200');
    expect(html).toContain('34');
    expect(html).toContain('google_ads brought leads at $5.00 each');
    expect(html).toContain('2026-07-14 → 2026-07-21');
  });

  it('renders gracefully without totals', () => {
    const html = renderWeeklyReportEmail('Acme', { summary: 'No ad spend this week.', highlights: [] });
    expect(html).toContain('No ad spend this week.');
    expect(html).not.toContain('<table');
  });
});

/** Presentation-only helpers. Account snapshots and dated history are different
 * scopes in the existing API; never describe snapshot totals as weekly totals. */
export type BriefSource = 'none' | 'live' | 'sandbox' | 'mixed' | 'demo';

export const SOURCE_LABELS: Record<BriefSource, string> = {
  none: 'No account data · connect a source to get started',
  live: 'Live account data · stored account snapshot',
  sandbox: 'Sandbox workspace · not live account data',
  mixed: 'Mixed sources · includes live and sandbox data',
  demo: 'Sample workspace · not live account data',
};

export const PLATFORM_NAMES: Record<string, string> = {
  google_ads: 'Google Ads', meta: 'Meta', tiktok: 'TikTok',
};

export function money(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}

export function dateKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

export function weekToDate(now: Date): { from: string; to: string } {
  const start = new Date(now);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return { from: dateKey(start), to: dateKey(now) };
}

export function shortDate(value: string): string {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export type ChannelSnapshot = { spendCents: number; conversions: number };

export function snapshotTakeaway(channels: Record<string, ChannelSnapshot>) {
  const rows = Object.entries(channels);
  const best = rows.filter(([, v]) => v.conversions > 0).sort(([, a], [, b]) => b.conversions - a.conversions)[0];
  const waste = rows.filter(([, v]) => v.spendCents > 0 && v.conversions === 0).sort(([, a], [, b]) => b.spendCents - a.spendCents)[0];
  const name = (key: string) => PLATFORM_NAMES[key] ?? key;
  if (best && waste) return {
    title: `${name(best[0])} is finding conversions. ${name(waste[0])} needs a review.`,
    body: `${name(best[0])} generated ${best[1].conversions.toLocaleString()} conversions. ${name(waste[0])} spent ${money(waste[1].spendCents)} with no conversions.`,
  };
  if (waste) return {
    title: 'Spend is moving. Conversions haven’t followed.',
    body: `${name(waste[0])} spent ${money(waste[1].spendCents)} with no conversions in the latest account snapshot. Review the source before making a change.`,
  };
  if (best) return {
    title: `${name(best[0])} leads on conversions.`,
    body: `${name(best[0])} generated ${best[1].conversions.toLocaleString()} conversions in the latest account snapshot. Review cost and campaign context before deciding what comes next.`,
  };
  return {
    title: rows.length ? 'Your next insight starts with more activity.' : 'A clearer week starts with your first connection.',
    body: rows.length ? 'There are no recorded conversions in the loaded account snapshot yet.' : 'Connect a read-only ad account to bring your performance, recommendations, and weekly report into one place.',
  };
}

export function planText(plan: unknown, key: 'title' | 'summary'): string | null {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const value = (plan as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

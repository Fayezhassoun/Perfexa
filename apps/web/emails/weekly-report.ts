// Weekly report email template (Phase 3). Pure renderer: takes the stored
// WeeklyReportPayload and produces a clean, mobile-friendly HTML email with
// GrowthCrew branding. Inline styles only (email-client safe). All dynamic
// text is HTML-escaped — the narrative may come from the LLM.

import type { WeeklyReportPayload } from '@growthcrew/db';

export interface WeeklyReportEmailInput {
  orgName: string;
  content: WeeklyReportPayload;
  /** Absolute link to the in-app report page (the "View full report" button). */
  reportUrl: string;
}

export interface RenderedWeeklyReportEmail {
  subject: string;
  html: string;
}

const BRAND_BLUE = '#2C61F1';
const BRAND_DARK = '#0f172a';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
};

function platformLabel(key: string): string {
  return PLATFORM_LABELS[key] ?? key;
}

function bulletList(items: string[]): string {
  return items
    .map((item) => `<li style="margin:0 0 10px;line-height:1.55">${escapeHtml(item)}</li>`)
    .join('');
}

function section(title: string, emoji: string, items: string[], ordered = false): string {
  if (items.length === 0) return '';
  const listItems = ordered
    ? items.map((item, i) => `<li style="margin:0 0 10px;line-height:1.55">${i + 1}. ${escapeHtml(item)}</li>`).join('')
    : bulletList(items);
  const tag = ordered ? 'ol' : 'ul';
  return `<tr>
      <td style="padding:0 0 20px">
        <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:${BRAND_DARK}">${emoji}&nbsp; ${escapeHtml(title)}</h2>
        <${tag} style="margin:0;padding:0 0 0 20px;color:#334155;font-size:14px">${listItems}</${tag}>
      </td>
    </tr>`;
}

export function renderWeeklyReportEmail(input: WeeklyReportEmailInput): RenderedWeeklyReportEmail {
  const { orgName, content, reportUrl } = input;
  const t = content.totals;
  const ctrPct = t.impressions > 0 ? ((t.clicks / t.impressions) * 100).toFixed(2) : '0.00';
  const cpa = t.conversions > 0 ? usd(Math.round(t.spendCents / t.conversions)) : '—';

  const stats: Array<[string, string]> = [
    ['Spend', usd(t.spendCents)],
    ['Conversions', t.conversions.toLocaleString('en-US')],
    ['Clicks', t.clicks.toLocaleString('en-US')],
    ['Cost / lead', cpa],
  ];
  const statCells = stats
    .map(
      ([label, value]) => `<td width="25%" style="padding:12px 8px;text-align:center;border-right:1px solid #eef2f7">
          <div style="font-size:18px;font-weight:700;color:${BRAND_DARK}">${escapeHtml(value)}</div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;margin-top:2px">${escapeHtml(label)}</div>
        </td>`,
    )
    .join('');

  const platformEntries = Object.entries(content.byPlatform).filter(
    ([, p]) => p.spendCents > 0 || p.impressions > 0,
  );
  const platformRows = platformEntries
    .map(([platform, p]) => {
      const pCtr = p.impressions > 0 ? ((p.clicks / p.impressions) * 100).toFixed(2) : '0.00';
      const pCpa = p.conversions > 0 ? usd(Math.round(p.spendCents / p.conversions)) : '—';
      return `<tr>
          <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;color:#334155;font-size:13px">${escapeHtml(platformLabel(platform))}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;color:#334155;font-size:13px;text-align:right">${escapeHtml(usd(p.spendCents))}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;color:#334155;font-size:13px;text-align:right">${p.impressions.toLocaleString('en-US')}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;color:#334155;font-size:13px;text-align:right">${pCtr}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;color:#334155;font-size:13px;text-align:right">${p.conversions}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #eef2f7;color:#334155;font-size:13px;text-align:right">${escapeHtml(pCpa)}</td>
        </tr>`;
    })
    .join('');

  const platformTable = platformEntries.length
    ? `<tr>
        <td style="padding:0 0 20px">
          <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:${BRAND_DARK}">📊&nbsp; Platform breakdown</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #eef2f7;border-radius:8px">
            <tr>
              <th style="padding:8px 10px;background:#f8fafc;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8">Platform</th>
              <th style="padding:8px 10px;background:#f8fafc;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8">Spend</th>
              <th style="padding:8px 10px;background:#f8fafc;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8">Impr.</th>
              <th style="padding:8px 10px;background:#f8fafc;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8">CTR</th>
              <th style="padding:8px 10px;background:#f8fafc;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8">Conv.</th>
              <th style="padding:8px 10px;background:#f8fafc;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8">CPA</th>
            </tr>
            ${platformRows}
          </table>
        </td>
      </tr>`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your weekly marketing report</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND_DARK}">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;padding:24px 12px">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
            <!-- Brand header -->
            <tr>
              <td style="background:${BRAND_DARK};padding:22px 28px">
                <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_BLUE}">GrowthCrew</div>
                <div style="font-size:12px;color:#94a3b8;margin-top:2px">Weekly marketing report</div>
              </td>
            </tr>
            <!-- Greeting + period -->
            <tr>
              <td style="padding:28px 28px 8px">
                <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${BRAND_DARK}">Your week at ${escapeHtml(orgName)}</h1>
                <div style="font-size:13px;color:#94a3b8">${escapeHtml(content.periodLabel)}</div>
              </td>
            </tr>
            <!-- Stat cards -->
            <tr>
              <td style="padding:16px 28px 8px">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border:1px solid #eef2f7;border-radius:10px">
                  <tr>${statCells}</tr>
                </table>
              </td>
            </tr>
            <!-- Executive summary -->
            <tr>
              <td style="padding:12px 28px 4px">
                <h2 style="margin:0 0 8px;font-size:15px;font-weight:700;color:${BRAND_DARK}">Executive summary</h2>
                <p style="margin:0;color:#334155;font-size:14px;line-height:1.6">
                  This week your account spent ${escapeHtml(usd(t.spendCents))} for
                  ${t.conversions.toLocaleString('en-US')} conversion${t.conversions === 1 ? '' : 's'} at a
                  ${escapeHtml(ctrPct)}% click-through rate${t.conversions > 0 ? ` and a blended ${escapeHtml(cpa)} per lead` : ''}.
                  The Guardian raised ${content.alertCount} alert${content.alertCount === 1 ? '' : 's'} and flagged
                  ${content.fatiguedCreatives} fatigued creative${content.fatiguedCreatives === 1 ? '' : 's'}.
                </p>
              </td>
            </tr>
            ${section('Wins', '🏆', content.wins)}
            ${section('Losses & risks', '⚠️', content.losses)}
            ${section('Recommendations', '💡', content.recommendations)}
            ${section('Next-week priorities', '🎯', content.priorities, true)}
            ${platformTable}
            <!-- CTA -->
            <tr>
              <td style="padding:8px 28px 28px" align="center">
                <a href="${escapeHtml(reportUrl)}"
                   style="display:inline-block;background:${BRAND_BLUE};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:10px">
                  View full report
                </a>
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="background:#f8fafc;padding:20px 28px;border-top:1px solid #eef2f7">
                <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;line-height:1.5">
                  You're receiving this because you own ${escapeHtml(orgName)} on GrowthCrew.
                  Nothing spends without your approval.
                </p>
                <p style="margin:0;color:#cbd5e1;font-size:11px">Powered by GrowthCrew — talk to your marketing team.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: `Your week at ${orgName} — GrowthCrew report`,
    html,
  };
}

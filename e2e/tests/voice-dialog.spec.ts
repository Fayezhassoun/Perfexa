// THE §12 reference dialog end-to-end (CONTRACTS §9/§12): voice brief →
// audit summary → clarification (typed — text parity) → proposal card →
// voice "approve" → launched state → dashboard populated.

import { expect, test } from '@playwright/test';
import { injectVoice, registerAndOnboard, uniqueEmail } from './helpers';

const BRIEF = 'I need an SEO specialist. I need my website to be top visible. I need to get leads.';

test('voice brief → proposal → approve → launched campaigns on the dashboard', async ({ page }) => {
  await registerAndOnboard(page, { email: uniqueEmail('voice'), website: 'https://example.com' });

  // 1. Voice brief via the mock STT hook.
  await injectVoice(page, BRIEF);
  const chat = page.getByTestId('chat-panel');
  await expect(chat).toContainText('58/100');
  await expect(chat).toContainText('3 missing meta description');
  await expect(chat).toContainText('no lead form');
  await expect(chat).toContainText('$500');
  await expect(chat).toContainText('60%');

  // 2. Clarify by TYPING (full voice↔text parity).
  await page.getByTestId('text-input').fill('Chicago area, yes $500 is fine.');
  await page.getByTestId('text-input').press('Enter');
  await expect(chat).toContainText(
    'Launch a $300/month Google Search campaign targeting Chicago — say approve or cancel.',
  );
  await expect(page.getByTestId('proposal-card')).toBeVisible();
  await expect(page.getByTestId('proposal-card')).toContainText('Google');

  // 3. Approve by voice.
  await injectVoice(page, 'approve');
  await expect(chat).toContainText(/sandbox/i);
  await expect(page.getByTestId('proposal-card')).toHaveCount(0);

  // 4. Campaign is live (sandbox) on the campaigns page.
  await page.goto('/campaigns');
  await expect(page.getByTestId('campaigns-page')).toContainText('Google Ads');
  await expect(page.getByTestId('campaigns-page')).toContainText('active');
  await expect(page.getByTestId('campaigns-page')).toContainText('sandbox');

  // 5. Dashboard populated: platform breakdown + agent activity.
  await page.goto('/dashboard');
  await expect(page.getByTestId('kpi-cards')).toContainText('Spend');
  await expect(page.getByTestId('dashboard')).toContainText('Google Ads');
  await expect(page.getByTestId('activity-feed')).not.toContainText('No agent activity yet.');

  // 6. Every action landed in the audit log.
  await page.goto('/audit');
  await expect(page.getByTestId('audit-page')).toContainText('tool.ads.create_campaign');
  await expect(page.getByTestId('audit-page')).toContainText('proposal.approved');

  // 7. The team exists under /agents.
  await page.goto('/agents');
  await expect(page.getByTestId('agents-grid')).toContainText('SEO Specialist');
  await expect(page.getByTestId('agents-grid')).toContainText('Google Ads Specialist');
  await expect(page.getByTestId('agents-grid')).toContainText('Lead Gen Specialist');
});

test('mic-denied fallback: everything works by typing', async ({ browser }) => {
  // Deny mic permission outright — the console must stay fully usable.
  const context = await browser.newContext({ permissions: [] });
  const page = await context.newPage();
  await registerAndOnboard(page, { email: uniqueEmail('text-only'), website: 'https://example.com' });

  await page.getByTestId('text-input').fill('I need leads for my business');
  await page.getByTestId('text-input').press('Enter');
  await expect(page.getByTestId('chat-panel')).toContainText('58/100');
  await context.close();
});

import { expect, type Page } from '@playwright/test';

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

/** Register a fresh account and complete the 5-step onboarding wizard.
 *
 * The wizard runs business → goals → connect → brand voice → first insight and
 * lands on /dashboard. Voice tests can pass continueTo: 'console' to proceed to
 * the voice console afterwards.
 */
export async function registerAndOnboard(
  page: Page,
  opts: { email: string; website?: string; continueTo?: 'console' },
): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Your name').fill('E2E Owner');
  await page.getByLabel('Email').fill(opts.email);
  await page.getByLabel(/Password/).fill('super-secret-pw-1');
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.waitForURL('**/onboarding');

  // Step 1 — business
  await page.getByLabel('Business name').fill('E2E Plumbing Co');
  await page.getByLabel(/Website/).fill(opts.website ?? 'https://example.com');
  await page.getByTestId('onboarding-next').click();

  // Step 2 — goals
  await page.getByRole('button', { name: /More leads/ }).click();
  await page.getByRole('button', { name: /Brand awareness/ }).click();
  await page.getByTestId('onboarding-next').click();

  // Step 3 — connect (skippable)
  await expect(page.getByText('Connect your first ad platform')).toBeVisible();
  await page.getByTestId('onboarding-next').click();

  // Step 4 — brand voice (defaults are fine)
  await expect(page.getByLabel('Tone')).toBeVisible();
  await page.getByTestId('onboarding-next').click();

  // Step 5 — first insight → finish (button enables once the scan settles)
  await expect(page.getByRole('heading', { name: 'Your first insight' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to dashboard' }).click();

  await page.waitForURL('**/dashboard');

  if (opts.continueTo === 'console') {
    await page.goto('/console');
    await expect(page.getByTestId('mic-button')).toBeVisible();
  }
}

/** Send a "voice" message through the mock STT test hook (CONTRACTS §10). */
export async function injectVoice(page: Page, text: string): Promise<void> {
  await page.waitForFunction(() => Boolean((window as never as { __voxSTT?: unknown }).__voxSTT));
  await page.evaluate(
    (t) => (window as never as { __voxSTT: { inject: (s: string) => void } }).__voxSTT.inject(t),
    text,
  );
}

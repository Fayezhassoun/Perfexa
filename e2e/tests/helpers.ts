import { expect, type Page } from '@playwright/test';

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

/** Register a fresh account and complete the onboarding wizard → /console. */
export async function registerAndOnboard(
  page: Page,
  opts: { email: string; website?: string; budget?: number },
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
  await page.getByRole('button', { name: /Be more visible/ }).click();
  await page.getByRole('button', { name: /Get leads/ }).click();
  await page.getByTestId('onboarding-next').click();

  // Step 3 — budget
  await page.getByLabel(/Maximum per month/).fill(String(opts.budget ?? 500));
  await page.getByTestId('onboarding-next').click();

  // Step 4 — connect (skippable) → finish
  await expect(page.getByText('Connect ad accounts')).toBeVisible();
  await page.getByTestId('onboarding-next').click();

  await page.waitForURL('**/console');
}

/** Send a "voice" message through the mock STT test hook (CONTRACTS §10). */
export async function injectVoice(page: Page, text: string): Promise<void> {
  await page.waitForFunction(() => Boolean((window as never as { __voxSTT?: unknown }).__voxSTT));
  await page.evaluate(
    (t) => (window as never as { __voxSTT: { inject: (s: string) => void } }).__voxSTT.inject(t),
    text,
  );
}

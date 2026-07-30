// Register → onboarding wizard → First 7-Day Growth Plan (CONTRACTS §12 spec 1).

import { expect, test } from '@playwright/test';
import { registerAndOnboard, uniqueEmail } from './helpers';

test('signup → wizard → growth plan, and login works afterwards', async ({ page }) => {
  const email = uniqueEmail('onboard');
  await registerAndOnboard(page, { email });

  // Landed on the First 7-Day Growth Plan with saved Business Brain context.
  await expect(page.getByRole('heading', { name: 'First 7-Day Growth Plan' })).toBeVisible();
  await expect(page.getByTestId('business-brain-summary')).toBeVisible();

  // Sign out, then back in with the same credentials.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('super-secret-pw-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/console');
  await expect(page.getByTestId('mic-button')).toBeVisible();
});

test('unauthenticated visitors are redirected to /login', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForURL('**/login');
});

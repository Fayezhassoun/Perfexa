// Register → onboarding wizard → Voice Console (CONTRACTS §12 spec 1).

import { expect, test } from '@playwright/test';
import { registerAndOnboard, uniqueEmail } from './helpers';

test('signup → wizard → console, and login works afterwards', async ({ page }) => {
  const email = uniqueEmail('onboard');
  await registerAndOnboard(page, { email });

  // Landed on the Voice Console with the mic ready.
  await expect(page.getByTestId('mic-button')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Voice Console' })).toBeVisible();

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

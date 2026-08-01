// Register → onboarding wizard → First 7-Day Growth Plan (CONTRACTS §12 spec 1).

import { expect, test } from '@playwright/test';
import { registerAndOnboard, uniqueEmail } from './helpers';

test('signup → wizard → growth plan, and login works afterwards', async ({ page }) => {
  const email = uniqueEmail('onboard');
  await registerAndOnboard(page, { email });

  // Onboarding now lands on the dashboard; the growth plan is one hop away.
  await page.goto('/growth-plan');
  await expect(page.getByRole('heading', { name: 'First 7-Day Growth Plan' })).toBeVisible();
  await expect(page.getByTestId('business-brain-summary')).toBeVisible();

  await page.getByRole('link', { name: 'Edit Business Brain' }).click();
  await page.waitForURL('**/business-brain');
  await page.getByLabel('Main offer').fill('Emergency plumbing with same-day arrival');
  await page.getByLabel('Ideal customer').fill('Homeowners who need a trusted local plumber');
  await page.getByRole('button', { name: 'Save Business Brain' }).click();
  await expect(page.getByText('Business Brain saved. GrowthCrew will use this context in your plan and console.')).toBeVisible();

  await page.goto('/growth-plan');
  const brainSummary = page.getByTestId('business-brain-summary');
  await expect(brainSummary.getByText('Emergency plumbing with same-day arrival')).toBeVisible();
  await expect(brainSummary.getByText('Homeowners who need a trusted local plumber')).toBeVisible();

  // The AdWhispr-inspired, GrowthCrew-safe competitor workflow is reachable and approval-gated.
  await page.goto('/inspiration');
  await expect(page.getByRole('heading', { name: 'Competitor Inspiration Studio' })).toBeVisible();
  await expect(page.getByText('research → adapt → approve')).toBeVisible();
  await expect(page.getByText('No copy/paste cloning')).toBeVisible();
  await expect(page.getByText('No live spend')).toBeVisible();

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

import { test, expect } from '@playwright/test';

test('landing CTA opens the onboarding route', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Create your Space' }).click();
  await expect(page).toHaveURL(/\/app\/onboarding/);
  await expect(page.getByRole('heading', { name: 'Connect' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Connect Wallet/i }).first()).toBeVisible();
});

test('onboarding frames the Space as a shared commerce environment', async ({ page }) => {
  await page.goto('/app/onboarding');
  await expect(page.getByText('One Space. People and software, working under the same rules.')).toBeVisible();
  await expect(page.getByText('Add participants, fund the ledger, and turn a request into verifiable work.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Participants/ })).toBeVisible();
});

test('onboarding checks the real API and advances prechecks', async ({ page }) => {
  await page.goto('/app/onboarding');
  await expect(page.getByRole('heading', { name: 'Connect' })).toBeVisible();
  await page.getByRole('button', { name: 'Check API and identity' }).click();
  await expect(page.getByText(/API online · chain 1952/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Space' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with active Space' }).click();
  await expect(page.getByRole('heading', { name: 'Participants' })).toBeVisible();
});

test('mobile onboarding has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/onboarding');
  await expect(page.getByRole('heading', { name: 'Connect' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

import { test, expect } from '@playwright/test';

test('the landing page connects to the app', async ({ page }) => {
  // The landing CTA used to read "Create your Space" and open /app/onboarding,
  // which put a six-step jargon wizard between a visitor and the product. It now
  // opens the app, where the entry gate asks whether they were invited or are
  // starting one.
  await page.goto('/');
  await page.getByRole('link', { name: 'Open the app' }).first().click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByRole('button', { name: /Connect Wallet/i }).first()).toBeVisible({ timeout: 15000 });
  // the header swaps the marketing link for the session controls once inside
  // the app, and carries the shortcut to the scenarios from every page
  await expect(page.getByRole('button', { name: /Try it/ })).toBeVisible();
});

test('every control on the landing page actually goes somewhere', async ({ page }) => {
  // The header action read "Open on Microcosm" and pointed at #cta, an anchor
  // further down the same page. It scrolled instead of opening the app, which is
  // the one thing a control labelled "Open" must not do.
  await page.goto('/');
  const open = page.getByRole('link', { name: 'Open on Microcosm' });
  await expect(open).toHaveAttribute('href', '/app');
  await open.click();
  await expect(page).toHaveURL(/\/app/);
  expect(new URL(page.url()).pathname).toBe('/app');
});

test('the onboarding route is still reachable and still explains itself', async ({ page }) => {
  await page.goto('/app/onboarding');
  await expect(page).toHaveURL(/\/app\/onboarding/);
  await expect(page.getByRole('heading', { name: 'Connect' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /Connect Wallet/i }).first()).toBeVisible({ timeout: 15000 });
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

import { test, expect } from '@playwright/test';

test('landing does not claim simulated hashes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('SIMULATED', { exact: true })).toHaveCount(0);
});

test('onboarding surfaces API failures instead of hanging', async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'health unavailable' } }) }));
  await page.goto('/app/onboarding');
  await page.getByRole('button', { name: 'Check API and identity' }).click();
  await expect(page.getByRole('paragraph').filter({ hasText: 'health unavailable' })).toBeVisible();
});

test('command center exposes policy and roster semantics', async ({ page }) => {
  await page.goto('/app#command');
  await expect(page.getByRole('heading', { name: 'The Space at a glance.' })).toBeVisible();
  await expect(page.getByText('SPACE-WIDE AUTHORITY')).toBeVisible();
  await expect(page.getByText('ROSTER', { exact: true })).toBeVisible();
  await expect(page.getByText('Space-wide, not actor-specific')).toBeVisible();
  await expect(page.getByText('SIMULATED', { exact: true })).toHaveCount(0);
});

test('work view exposes lifecycle board and explicit state surface', async ({ page }) => {
  await page.goto('/app#work');
  await expect(page.getByRole('heading', { name: 'Proof before payout.' })).toBeVisible();
  await expect(page.getByText('FUNDED', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('SUBMITTED', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('ADJUDICATING', { exact: true }).first()).toBeVisible();
});

test('audit view exposes paginated activity and stream state', async ({ page }) => {
  await page.goto('/app#audit');
  await expect(page.getByRole('heading', { name: 'Proof has a trail.' })).toBeVisible();
  await expect(page.getByText('LIVE ACTIVITY')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load older activity' })).toBeEnabled();
  await expect(page.getByText(/SSE (LIVE|RECONNECTING|WAITING)/)).toBeVisible();
});

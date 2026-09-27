import { gotoView } from './helpers/space';
import { test, expect } from '@playwright/test';

test('landing does not claim simulated hashes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('SIMULATED', { exact: true })).toHaveCount(0);
});

test('Space access requires a connected wallet, and says so first', async ({ page }) => {
  // The gate replaced the old "Connect a wallet to enter a Space" line. The
  // requirement did not change: no Space can be entered, created or paid for
  // until a wallet is connected, and the gate now says that before offering the
  // two ways in rather than after.
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'You are not in a Space yet.' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Start by connecting a wallet.')).toBeVisible();
  expect(await page.getByRole('button', { name: 'Create a Space' }).count()).toBe(0);
});
test('bearer invite URL opens the redemption surface', async ({ page }) => {
  await page.goto('/app/access?code=invite-demo');
  await expect(page.getByRole('heading', { name: 'Join the Space.' })).toBeVisible();
  await expect(page.getByText('invite-demo')).toBeVisible();
});

test('onboarding surfaces API failures instead of hanging', async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'health unavailable' } }) }));
  await page.goto('/app/onboarding');
  await page.getByRole('button', { name: 'Check API and identity' }).click();
  await expect(page.getByRole('paragraph').filter({ hasText: 'health unavailable' })).toBeVisible();
});

test('command center exposes policy and roster semantics', async ({ page }) => {
  await gotoView(page);
  await expect(page.getByRole('heading', { name: 'The Space at a glance.' })).toBeVisible();
  await expect(page.getByText('SPACE-WIDE AUTHORITY')).toBeVisible();
  await expect(page.getByText('ROSTER', { exact: true })).toBeVisible();
  await expect(page.getByText('Space-wide, not actor-specific')).toBeVisible();
  await expect(page.getByText('SIMULATED', { exact: true })).toHaveCount(0);
});

test('work view exposes lifecycle board and explicit state surface', async ({ page }) => {
  await gotoView(page, '/app#work');
  await expect(page.getByRole('heading', { name: 'Proof before payout.' })).toBeVisible();
  await expect(page.getByText('FUNDED', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('SUBMITTED', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('ADJUDICATING', { exact: true }).first()).toBeVisible();
});

test('audit view exposes paginated activity and stream state', async ({ page }) => {
  await gotoView(page, '/app#settings=proof');
  await expect(page.getByRole('heading', { name: 'Proof has a trail.' })).toBeVisible();
  await expect(page.getByText('LIVE ACTIVITY')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load older activity' })).toBeEnabled();
  await expect(page.getByText(/SSE (LIVE|RECONNECTING|WAITING)/)).toBeVisible();
});

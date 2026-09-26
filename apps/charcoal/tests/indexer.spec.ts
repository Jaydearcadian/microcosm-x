import { test, expect } from '@playwright/test';

test('audit view states whether a chain indexer is configured', async ({ page }) => {
  await page.goto('/app#audit');
  await expect(page.getByRole('heading', { name: 'Proof has a trail.' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('CHAIN INDEXER', { exact: true })).toBeVisible();
  // the panel must never claim a projection it cannot show
  const pill = page.locator('.indexer-panel .status-pill');
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText(/RECONCILED|NOT CONFIGURED|UNKNOWN/);
});

test('the indexer panel explains an unconfigured deployment instead of failing', async ({ page }) => {
  await page.goto('/app#audit');
  // The panel renders a loading state while the status request is in flight, so
  // branching on which terminal state has appeared yet races the fetch. Wait for
  // the panel to settle first, then assert the branch that actually applies.
  const panel = page.locator('.indexer-panel');
  await expect(panel).toBeVisible({ timeout: 20000 });
  await expect(panel).not.toContainText('Reading indexer status', { timeout: 20000 });
  const notConfigured = panel.getByText('NOT CONFIGURED');
  if (await notConfigured.count()) {
    await expect(page.getByText(/no chain indexer is configured for this deployment/i)).toBeVisible();
    await expect(page.getByText(/sequenced activity log/i)).toBeVisible();
  } else {
    await expect(page.getByText(/onchain projections/)).toBeVisible();
  }
});

test('audit view keeps its sequenced activity stream', async ({ page }) => {
  await page.goto('/app#audit');
  await expect(page.getByRole('heading', { name: 'Proof has a trail.' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/LIVE ACTIVITY/i)).toBeVisible();
});

test('mobile audit view has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app#audit');
  await expect(page.getByRole('heading', { name: 'Proof has a trail.' })).toBeVisible({ timeout: 20000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

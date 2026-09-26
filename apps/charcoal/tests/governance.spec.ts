import { test, expect } from '@playwright/test';

test('governance is reachable from the app rail and states the quorum rule', async ({ page }) => {
  await page.goto('/app#settings=people');
  await expect(page.getByRole('heading', { name: 'Rules move by signature.' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/allowlisted signers approve the same EIP-712 digest/i)).toBeVisible();
  await expect(page.getByText('APPROVAL QUEUE', { exact: true })).toBeVisible();
});

test('governance is read-only until a wallet session is signed', async ({ page }) => {
  await page.goto('/app#settings=people');
  await expect(page.getByText(/Governance is session-bound/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Connect and sign a session to propose or approve a payment\./)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Queue for approval' })).toHaveCount(0);
});

test('governance shows no error flash while signed out', async ({ page }) => {
  await page.goto('/app#settings=people');
  await expect(page.getByRole('heading', { name: 'Rules move by signature.' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.action-flash--danger')).toHaveCount(0);
});

test('governance never renders an approval control for an unconfigured Space', async ({ page }) => {
  await page.goto('/app#settings=people');
  await expect(page.getByRole('heading', { name: 'Rules move by signature.' })).toBeVisible({ timeout: 15000 });
  const signButtons = page.getByRole('button', { name: 'Sign approval' });
  await expect(signButtons).toHaveCount(0);
  const executeButtons = page.getByRole('button', { name: 'Execute payment' });
  await expect(executeButtons).toHaveCount(0);
});

test('mobile governance view has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app#settings=people');
  await expect(page.getByRole('heading', { name: 'Rules move by signature.' })).toBeVisible({ timeout: 15000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

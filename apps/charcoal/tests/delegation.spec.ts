import { test, expect } from '@playwright/test';

test('delegation view states the attenuation rule and shows the parent envelope', async ({ page }) => {
  await page.goto('/app');
  await page.getByRole('button', { name: /Delegation/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Authority narrows. It never grows.' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/rejected by a subset proof, not by review/i)).toBeVisible();
  await expect(page.getByText('PARENT ENVELOPE')).toBeVisible();
});

test('delegation is read-only until a wallet session is signed', async ({ page }) => {
  await page.goto('/app#delegation');
  await expect(page.getByText(/Connect and sign a session as an admin, agent, or operator/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Create envelope' })).toHaveCount(0);
});

test('delegation exposes no sign, verify, or revoke control without a session', async ({ page }) => {
  await page.goto('/app#delegation');
  await expect(page.getByRole('heading', { name: 'Authority narrows. It never grows.' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Sign envelope' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
});

test('mobile delegation view has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app#delegation');
  await expect(page.getByRole('heading', { name: 'Authority narrows. It never grows.' })).toBeVisible({ timeout: 15000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

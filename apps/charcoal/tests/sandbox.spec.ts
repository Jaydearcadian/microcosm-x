import { test, expect, type APIRequestContext } from '@playwright/test';

const PROVIDER = '0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367';

async function provisionSpace(request: APIRequestContext): Promise<string> {
  const created = await request.post('/api/spaces', { data: { name: `Sandbox ${Date.now().toString(36)}`, actorId: 'admin-01' } });
  const space = (await created.json()).space as { id: string };
  await request.post(`/api/spaces/${space.id}/fund`, { data: { amount: '5000.00', actorId: 'admin-01' } });
  // a work order needs an address-backed provider that is a Space participant
  await request.post(`/api/spaces/${space.id}/participants`, {
    data: { kind: 'Agent', displayName: 'Sandbox Provider', address: PROVIDER, actorId: 'admin-01' },
  });
  return space.id;
}

async function openSandbox(page: import('@playwright/test').Page, request: APIRequestContext) {
  const spaceId = await provisionSpace(request);
  await page.goto('/app');
  await page.getByLabel('Active Space').selectOption(spaceId);
  await page.getByRole('button', { name: /Test/ }).first().click();
  await expect(page.getByRole('heading', { name: 'One click. One verdict.' })).toBeVisible({ timeout: 20000 });
  return spaceId;
}

test('sandbox lists scenarios that each declare an expected outcome', async ({ page, request }) => {
  await openSandbox(page, request);
  await expect(page.getByText('Request above the per-transaction cap')).toBeVisible();
  await expect(page.getByText('Counterparty outside the allowlist')).toBeVisible();
  await expect(page.getByText('Actor that is not a participant')).toBeVisible();
  await expect(page.getByText('Compliant order inside every rule')).toBeVisible();
  await expect(page.getByText('EXPECT REFUSED').first()).toBeVisible();
  await expect(page.getByText('EXPECT ACCEPTED')).toBeVisible();
});

test('one click on an over-cap scenario proves the refusal and its invariants', async ({ page, request }) => {
  await openSandbox(page, request);
  const card = page.locator('.sandbox-card').filter({ hasText: 'Request above the per-transaction cap' });
  await card.getByRole('button', { name: 'Run scenario' }).click();
  await expect(card.getByText('PASS', { exact: true })).toBeVisible({ timeout: 25000 });
  await expect(page.getByText('INVARIANTS HELD')).toBeVisible({ timeout: 25000 });
  for (const label of ['Refused by the API', 'A DenialProof was issued', 'Treasury unchanged', 'Escrow unchanged', 'No Work Order created']) {
    await expect(page.locator('.sandbox-checks li').filter({ hasText: label })).toContainText('PASS');
  }
});

test('the refusal scenario surfaces the real DenialProof', async ({ page, request }) => {
  await openSandbox(page, request);
  const card = page.locator('.sandbox-card').filter({ hasText: 'Request above the per-transaction cap' });
  await card.getByRole('button', { name: 'Run scenario' }).click();
  await expect(page.locator('.sandbox-proof')).toBeVisible({ timeout: 25000 });
  await expect(page.locator('.sandbox-proof')).toContainText(/cap/i);
});

test('the compliant control case really moves money into escrow', async ({ page, request }) => {
  await openSandbox(page, request);
  const card = page.locator('.sandbox-card').filter({ hasText: 'Compliant order inside every rule' });
  await card.getByRole('button', { name: 'Run scenario' }).click();
  await expect(page.getByText('INVARIANTS HELD')).toBeVisible({ timeout: 25000 });
  for (const label of ['Accepted by the API', 'Only the budget left the treasury', 'Escrow received it', 'Order is Funded']) {
    await expect(page.locator('.sandbox-checks li').filter({ hasText: label })).toContainText('PASS');
  }
  await expect(page.getByText(/Work Order job-/)).toBeVisible();
});

test('mobile sandbox view has no horizontal overflow', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSandbox(page, request);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

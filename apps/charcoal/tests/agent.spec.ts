import { test, expect, type APIRequestContext } from '@playwright/test';

const CAPABILITY_COPY = ['payment', 'work', 'request', 'court'] as const;

/**
 * The app auto-selects whichever Space it finds first, and a long-lived dev
 * store accumulates Spaces created by other specs. These tests therefore
 * provision their own Space with a real allowlisted counterparty and select it
 * in the rail, so they never depend on leftover state.
 */
/** The counterparty the compliant scenario pays. Must match PAY_T below. */
const PAYEE = '0x1111111111111111111111111111111111111111';

async function provisionSpace(request: APIRequestContext): Promise<{ id: string; name: string }> {
  const stamp = Date.now().toString(36);
  const created = await request.post('/api/spaces', { data: { name: `Agent Surface ${stamp}`, actorId: 'admin-01' } });
  expect(created.ok()).toBeTruthy();
  const space = (await created.json()).space as { id: string; name: string };
  await request.post(`/api/spaces/${space.id}/fund`, { data: { amount: '5000.00', actorId: 'admin-01' } });
  // Name the payee as a participant, which approves it as a counterparty. A
  // payment to an unapproved recipient is refused, which is the behaviour
  // SPACE-9 pins, so a Space with an empty allowlist can no longer be used to
  // demonstrate a compliant payment without approving the recipient first.
  await request.post(`/api/spaces/${space.id}/participants`, {
    data: { kind: 'Service', displayName: 'CloudCompute Corp', address: PAYEE, actorId: 'admin-01' },
  });
  return space;
}

async function openAgentSurface(page: import('@playwright/test').Page, request: APIRequestContext) {
  const space = await provisionSpace(request);
  await page.goto('/app');
  await page.getByLabel('Active Space').selectOption(space.id);
  await page.goto('/app#settings=people');
  await expect(page.getByRole('heading', { name: 'What an agent may do, published.' })).toBeVisible({ timeout: 20000 });
  return space;
}

test('agent view publishes the capability manifest and the Space policy it carries', async ({ page, request }) => {
  await openAgentSurface(page, request);
  await expect(page.getByText('CAPABILITY MANIFEST', { exact: true })).toBeVisible();
  await expect(page.getByText('microcosm.space.capability-manifest/v1')).toBeVisible();
  for (const id of CAPABILITY_COPY) await expect(page.getByText(id, { exact: true })).toBeVisible();
  await expect(page.getByText(/counterparty allowlist/i)).toBeVisible();
});

test('the x402 probe refuses a payload over the Space cap and names the reason', async ({ page, request }) => {
  await openAgentSurface(page, request);
  // this Space has no allowlisted counterparty or address-backed member,
  // so the probe must ask for a payTo instead of guessing one
  await expect(page.getByRole('button', { name: 'Try over the cap' })).toBeDisabled();
  await page.getByLabel('PAY TO').fill(PAYEE);
  await page.getByRole('button', { name: 'Try over the cap' }).click();
  await expect(page.getByText('REFUSED', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.agent-verdict__reasons')).toContainText('Exceeds Space per-transaction cap');
});

test('a compliant x402 payload validates as allowed', async ({ page, request }) => {
  await openAgentSurface(page, request);
  await page.getByLabel('AMOUNT').fill('350.00');
  await page.getByLabel('PAY TO').fill(PAYEE);
  await page.getByRole('button', { name: 'Validate in policy' }).click();
  await expect(page.getByText('ALLOWED', { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/policy allows/)).toBeVisible();
});

test('agent view states that settlement is fail-closed', async ({ page, request }) => {
  await openAgentSurface(page, request);
  await expect(page.getByText(/UNSUPPORTED_SETTLEMENT rather than a fabricated receipt/)).toBeVisible();
});

test('mobile agent view has no horizontal overflow', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAgentSurface(page, request);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

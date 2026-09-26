import { test, expect, type APIRequestContext } from '@playwright/test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const PROVIDER = '0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367';

/**
 * Funding a Space and adding a participant both need a principal now, so the
 * suite signs in as a real wallet and creates the Space under that address
 * rather than naming an actor that owns nothing.
 */
async function provisionSpace(request: APIRequestContext): Promise<{ spaceId: string; cookie: string; address: string }> {
  const account = privateKeyToAccount(generatePrivateKey());
  const challenge = await request.get(`/api/auth/challenge?address=${account.address}`);
  const { message } = (await challenge.json()) as { message: string };
  const session = await request.post('/api/auth/session', {
    data: { address: account.address, signature: await account.signMessage({ message }) },
  });
  const cookie = (session.headers()['set-cookie'] ?? '').split(';')[0];
  expect(cookie, 'sign-in returned no session cookie').toBeTruthy();
  const auth = { headers: { Cookie: cookie } };

  const created = await request.post('/api/spaces', { ...auth, data: { name: `Sandbox ${Date.now().toString(36)}`, actorId: account.address } });
  const space = (await created.json()).space as { id: string };
  const funded = await request.post(`/api/spaces/${space.id}/fund`, { ...auth, data: { amount: '5000.00', actorId: account.address } });
  expect(funded.status(), 'funding needs a principal').toBe(200);
  // a work order needs an address-backed provider that is a Space participant
  const added = await request.post(`/api/spaces/${space.id}/participants`, {
    ...auth,
    data: { kind: 'Agent', displayName: 'Sandbox Provider', address: PROVIDER, actorId: account.address },
  });
  expect(added.status(), 'adding a participant needs a principal').toBe(201);
  return { spaceId: space.id, cookie, address: account.address };
}

async function openSandbox(page: import('@playwright/test').Page, request: APIRequestContext) {
  const { spaceId, cookie, address } = await provisionSpace(request);
  await page.goto('/app');
  // The scenarios move money, so the browser needs the same session the API
  // used. Handing the page the cookie is the connected-wallet experience without
  // injecting a fake provider into every sandbox test.
  const token = decodeURIComponent(cookie.split('=').slice(1).join('='));
  // The host has to match the one the page is served from. The suite runs on
  // 127.0.0.1, and a cookie scoped to localhost is simply never sent, which
  // looks exactly like the session being ignored.
  const host = new URL(page.url()).hostname;
  await page.context().addCookies([{ name: 'microcosm_session', value: token, domain: host, path: '/' }]);
  await page.reload();
  await page.getByLabel('Active Space').selectOption(spaceId);
  // Act as the signed-in founder. The option's *value* is the member's display
  // name while its label carries the wallet address, so match on the text and
  // select by the value that actually sits under it. Picking a positional
  // fallback here is how the suite ended up running the scenario as the agent.
  const actor = page.getByLabel('Acting actor');
  const value = await actor
    .locator('option')
    .filter({ hasText: new RegExp(address, 'i') })
    .first()
    .getAttribute('value');
  expect(value, 'the founder should be selectable as an actor').toBeTruthy();
  await actor.selectOption(value!);
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

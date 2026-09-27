import { test, expect } from '@playwright/test';

/**
 * Two doors into the app, in order, and neither opens by itself.
 *
 * The app used to auto-select the first Space with work, which on a fresh
 * install is a demo Space the visitor is 'unaffiliated' with. A new arrival was
 * dropped inside somebody else's books — money, rules and jobs on screen,
 * controls that did nothing, and neither "join" nor "create" anywhere on the
 * page. The only way in was to notice the Space picker and set it back to
 * "No Space yet".
 *
 * The order is now: connect a wallet, then choose join or create, then
 * configure. The demo is offered as a labelled choice, never selected for you.
 */
test('connect first, and the two real ways in appear only once you have', async ({ page }) => {
  await page.goto('/app');
  await page.waitForTimeout(3500);

  // The gate leads, and nothing was selected behind their back.
  await expect(page.getByRole('heading', { name: 'You are not in a Space yet.' })).toBeVisible({ timeout: 15000 });
  expect(await page.getByLabel('Active Space').inputValue()).toBe('');

  // No modal opened over the page on arrival.
  expect(await page.getByRole('dialog').count()).toBe(0);

  // Step one is a wallet, in words, and it is the only thing on offer. The
  // choice between joining and creating is deliberately not reachable yet: a
  // Space is created and paid for by somebody, and until we know who, there is
  // nothing to create it against.
  await expect(page.getByText('Start by connecting a wallet.')).toBeVisible();
  expect(await page.getByRole('button', { name: 'Create a Space' }).count()).toBe(0);
  expect(await page.getByRole('button', { name: /Join with that invite/ }).count()).toBe(0);

  // The header offers the same thing, and it is a button rather than a popup.
  await expect(page.getByRole('button', { name: /Connect Wallet/i }).first()).toBeVisible();
});

test('the demo is a labelled choice, and choosing it is what opens it', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Just looking?' })).toBeVisible({ timeout: 15000 });

  // It says plainly that the Space is not yours and that it is read-only.
  await expect(page.getByText(/You are not a member of them/)).toBeVisible();
  await expect(page.getByText(/read-only/)).toBeVisible();

  // Still nothing selected before the click.
  expect(await page.getByLabel('Active Space').inputValue()).toBe('');

  const open = page.getByRole('button', { name: /^Open “/ }).first();
  await expect(open).toBeVisible();
  await open.click();
  await page.waitForTimeout(2500);

  // Now, and only now, a Space is open and the gate is gone.
  expect(await page.getByLabel('Active Space').inputValue()).not.toBe('');
  expect(await page.getByText('You are not in a Space yet.').count()).toBe(0);
});

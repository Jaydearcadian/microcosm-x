/**
 * The reconciliation panel in the Proof view.
 *
 * This panel exists to say whether the chain backs what our books claim, and its
 * value depends entirely on not being reassuring when it has nothing good to
 * say. So the cases worth protecting are the unhappy ones: a ledger that outruns
 * the chain, a router whose own books do not add up, and a router that was never
 * built to hold funds at all. Each must block the switch to funding payments
 * from a Space's own pool.
 */
import { test, expect, type Page } from '@playwright/test';
import { gotoView } from './helpers/space';

const UNBACKED = {
  poolDeployed: true,
  perSpace: [{ spaceId: 'space-alpha-9f2c', claimed: '4650.000000', heldOnChain: '0.000000', difference: '4650.000000', agrees: false, state: 'UNBACKED' as const }],
  summary: { claimTotal: '4650.000000', heldTotal: '0.000000', routerTokenBalance: '0.000000', totalAccounted: '0.000000', excess: '0.000000', unbacked: '4650.000000', unrecorded: '0.000000' },
  chainBalances: true, agrees: false, readyToFundFromPool: false,
  checkedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * The mock is registered before navigating: the fetch fires on entering the
 * Space, and reloading afterwards drops the demo Space we just opened. That
 * mistake cost two runs before it was understood.
 */
async function showReport(page: Page, report: unknown) {
  await page.route('**/reconciliation**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reconciliation: report }) }));
  await gotoView(page);
  await page.evaluate(() => { window.location.hash = '#settings=proof'; });
  await page.waitForTimeout(3000);
}

test('recon: an unbacked ledger is stated plainly, with the numbers', async ({ page }) => {
  await showReport(page, UNBACKED);
  await expect(page.getByText('Do the chain and our books agree?')).toBeVisible();
  await expect(page.getByText('OUR BOOKS ARE NOT BACKED BY THE CHAIN')).toBeVisible();
  await expect(page.locator('.recon__table tbody tr td', { hasText: 'UNBACKED' })).toBeVisible();
  // The verdict alone would be an assertion; naming the shared wallet the money
  // is actually in is the fact a reader needs.
  await expect(page.getByText(/held in one shared wallet, not per Space/)).toBeVisible();
  await expect(page.getByText('blocked until the books agree')).toBeVisible();
});

test('recon: a router whose books do not add up is a contract problem, and stays blocked', async ({ page }) => {
  await showReport(page, {
    ...UNBACKED,
    perSpace: [{ spaceId: 'space-alpha-9f2c', claimed: '1000.000000', heldOnChain: '1000.000000', difference: '0.000000', agrees: true, state: 'AGREES' as const }],
    summary: { claimTotal: '1000.000000', heldTotal: '1000.000000', routerTokenBalance: '900.000000', totalAccounted: '1000.000000', excess: '0.000000', unbacked: '0.000000', unrecorded: '0.000000' },
    // The books agree with each other; the chain holds less than it owes. This
    // is the case where agreement must not read as permission to switch.
    chainBalances: false, agrees: true, readyToFundFromPool: false,
  });
  await expect(page.getByText('THE ROUTER’S BOOKS DO NOT ADD UP')).toBeVisible();
  await expect(page.getByText(/contract, not with this page/)).toBeVisible();
  await expect(page.getByText('blocked until the books agree')).toBeVisible();
});

test('recon: a router with no pool is not a router holding nothing', async ({ page }) => {
  await showReport(page, { ...UNBACKED, poolDeployed: false, chainBalances: false });
  await expect(page.getByText('THIS ROUTER HAS NO PER-SPACE POOL')).toBeVisible();
  await expect(page.getByText(/built before per-Space pools existed/)).toBeVisible();
  await expect(page.getByText('blocked until the books agree')).toBeVisible();
});

test('recon: agreement unblocks, and the excess is sweepable rather than credited', async ({ page }) => {
  await showReport(page, {
    poolDeployed: true,
    perSpace: [{ spaceId: 'space-alpha-9f2c', claimed: '1000.000000', heldOnChain: '1000.000000', difference: '0.000000', agrees: true, state: 'AGREES' as const }],
    // The router holds 1007 against 1000 owed, so 7 USDC is unclaimed.
    summary: { claimTotal: '1000.000000', heldTotal: '1000.000000', routerTokenBalance: '1007.000000', totalAccounted: '1000.000000', excess: '7.000000', unbacked: '0.000000', unrecorded: '0.000000' },
    chainBalances: true, agrees: true, readyToFundFromPool: true,
    checkedAt: '2026-01-01T00:00:00.000Z',
  });
  await expect(page.getByText('THE CHAIN MATCHES OUR BOOKS')).toBeVisible();
  await expect(page.getByText('unblocked')).toBeVisible();
  await expect(page.getByText(/sent to the router by mistake and is sweepable/)).toBeVisible();
  const table = page.locator('.recon__table');
  await expect(table).toContainText('1000.000000');
  await expect(table).not.toContainText('7.000000');
});

test('recon: the panel is absent without a principal rather than falsely reassuring', async ({ page }) => {
  // No route mock, so this hits the real session-gated endpoint and gets a 401.
  // "Could not check" must never be rendered as "everything is fine".
  await gotoView(page);
  await page.evaluate(() => { window.location.hash = '#settings=proof'; });
  await page.waitForTimeout(3000);
  await expect(page.getByText('Do the chain and our books agree?')).toHaveCount(0);
});

test('recon: funds a Space cannot spend are called stranded, not ready', async ({ page }) => {
  // The books and the chain agree perfectly here. What is missing is a signed
  // binding, so the Space holds money it can never pay out with — a state that
  // agreement on its own would have reported as ready.
  await showReport(page, {
    poolDeployed: true, chainBalances: true, agrees: true, readyToFundFromPool: false,
    stranded: { spaces: ['space-alpha-9f2c'], total: '4530.000000' },
    perSpace: [{ spaceId: 'space-alpha-9f2c', claimed: '4530.000000', heldOnChain: '4530.000000', difference: '0.000000', agrees: true, state: 'AGREES', bound: false, spendable: false }],
    summary: { claimTotal: '4530.000000', heldTotal: '4530.000000', routerTokenBalance: '4530.000000', totalAccounted: '4530.000000', excess: '0.000000', unbacked: '0.000000', unrecorded: '0.000000' },
    checkedAt: '2026-01-01T00:00:00.000Z',
  });
  await expect(page.getByText('IS HELD BUT CANNOT BE SPENT')).toBeVisible();
  await expect(page.getByText(/never signed spending limits on chain/)).toBeVisible();
  await expect(page.getByText('no — unsigned limits')).toBeVisible();
  await expect(page.getByText('blocked until the books agree')).toBeVisible();
});

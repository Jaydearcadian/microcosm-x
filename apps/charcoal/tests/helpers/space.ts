import type { Page } from '@playwright/test';

/**
 * Open a Space, then go to a view inside it.
 *
 * The app no longer picks a Space for you on arrival — a new visitor gets the
 * entry gate and chooses. Specs that assert on a view therefore have to make
 * that choice themselves, which is the same thing a person does.
 *
 * The gate's demo Spaces are used here: they exist, they are read-only, and
 * opening one does not need a wallet. Specs about a *specific* Space provision
 * their own and select it, as sandbox.spec and agent.spec do.
 */
export async function gotoView(page: Page, path = '/app'): Promise<void> {
  await page.goto('/app');
  // The gate lists its demo Spaces only after the Space list has loaded, so
  // this has to wait for the button rather than count it. Counting straight
  // after goto found zero, silently skipped the click, and the spec then ran
  // against the gate.
  const openDemo = page.getByRole('button', { name: /^Open “/ }).first();
  const arrived = await openDemo
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (arrived) {
    await openDemo.click();
    await page.waitForTimeout(2500);
  }
  // Move to the requested view by changing the hash only. A real navigation
  // would reload the app, which throws away the Space that was just chosen and
  // drops the spec straight back onto the gate.
  const hash = path.includes('#') ? path.slice(path.indexOf('#')) : '';
  if (hash) {
    await page.evaluate((value) => { window.location.hash = value; }, hash);
    await page.waitForTimeout(1200);
  }
}

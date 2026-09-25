import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    body: document.body.scrollWidth > document.body.clientWidth,
    root: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))).toEqual({ body: false, root: false });
}

const routes = [
  { path: "/", ready: async (page: Page) => expect(page.getByRole("heading", { name: "One shared Space where people and software get work done." })).toBeVisible(), control: "Open on Microcosm" },
  { path: "/app", ready: async (page: Page) => expect(page.getByRole("heading", { name: "The Space at a glance." })).toBeVisible(), control: "Connect Wallet" },
  { path: "/app/access?code=mobile-invite", ready: async (page: Page) => expect(page.getByRole("heading", { name: "Join the Space." })).toBeVisible(), control: "Connect Wallet" },
  { path: "/app/onboarding", ready: async (page: Page) => expect(page.getByRole("heading", { name: "Connect" })).toBeVisible(), control: "Connect Wallet" },
] as const;

for (const route of routes) {
  test(`${route.path} fits mobile width and exposes its primary control`, async ({ page }) => {
    await page.goto(route.path);
    await route.ready(page);
    await expectNoHorizontalOverflow(page);
    if (route.path === "/") {
      await expect(page.getByRole("link", { name: route.control })).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: route.control }).first()).toBeVisible();
    }
  });
}

test("app view navigation stays overflow-free and exposes wallet controls", async ({ page }) => {
  await page.goto("/app");
  const navigation = page.getByRole("navigation", { name: "App views" });
  const views = [
    { button: "Command Center", heading: "The Space at a glance." },
    { button: "Work", heading: "Proof before payout." },
    { button: "Onboarding", heading: "Connect" },
    { button: "Audit", heading: "Proof has a trail." },
  ];

  for (const view of views) {
    const button = navigation.getByRole("button", { name: new RegExp(view.button) });
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: view.heading })).toBeVisible();
    await expect(page.getByRole("button", { name: /Connect Wallet/i }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hexToString } from "viem";
import type { Hex } from "viem";

/*
 * The create-a-Space path.
 *
 * Both tests are live. The full flow drives the wallet the way the app does —
 * connect, sign the session, create the Space, set limits, fund it, sign the
 * budget binding, then sign an EIP-712 delegation for the agent — and asserts
 * on what the server actually returned rather than on the shape of the page.
 *
 * The injected provider implements `personal_sign` and `eth_signTypedData_v4`
 * because the flow needs both: the session and the budget binding are plain
 * messages, the delegation is typed data.
 *
 * The server side of every step is also tested directly in
 * packages/server/test/governance.test.js (M13-1), including that a forged
 * signature is rejected.
 */

async function installInjectedWallet(context: BrowserContext, page: Page) {
  const account = privateKeyToAccount(generatePrivateKey());
  await context.exposeFunction("personalSign", async (message: string, address: string) => {
    if (address.toLowerCase() !== account.address.toLowerCase()) throw new Error("Unexpected signing address.");
    const signableMessage = message.startsWith("0x") ? hexToString(message as Hex) : message;
    return account.signMessage({ message: signableMessage });
  });
  // The delegation step signs EIP-712, not a plain message, so the injected
  // wallet has to be able to do that too.
  await context.exposeFunction("signTypedData", async (payload: string, address: string) => {
    if (address.toLowerCase() !== account.address.toLowerCase()) throw new Error("Unexpected signing address.");
    return account.signTypedData(JSON.parse(payload));
  });
  await page.addInitScript(({ address, chainId }) => {
    type Listener = (...args: unknown[]) => void;
    type RequestArguments = { method: string; params?: unknown[] };
    type Provider = {
      providers: Provider[];
      request: (args: RequestArguments) => Promise<unknown>;
      on: (event: string, listener: Listener) => void;
      removeListener: (event: string, listener: Listener) => void;
    };
    const accountStorageKey = "microcosm-e2e-wallet-authorized";
    const listeners = new Map<string, Set<Listener>>();
    const emit = (event: string, ...args: unknown[]) => {
      listeners.get(event)?.forEach((listener) => listener(...args));
    };
    const provider: Provider = {
      providers: [],
      async request({ method, params = [] }) {
        if (method === "eth_requestAccounts") {
          window.localStorage.setItem(accountStorageKey, "true");
          return [address];
        }
        if (method === "eth_accounts") return window.localStorage.getItem(accountStorageKey) === "true" ? [address] : [];
        if (method === "eth_chainId") return chainId;
        if (method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }];
        if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
        if (method === "eth_signTypedData_v4" || method === "eth_signTypedData") {
          // Note the order: this method takes [address, typedData], unlike
          // personal_sign which takes [message, address].
          const [signer, payload] = params as [string, string];
          return (window as typeof window & { signTypedData: (value: string, signerAddress: string) => Promise<string> }).signTypedData(payload, signer);
        }
        if (method === "personal_sign") {
          const [message, signer] = params as [string, string];
          return (window as typeof window & { personalSign: (value: string, signerAddress: string) => Promise<string> }).personalSign(message, signer);
        }
        throw new Error(`Unsupported EIP-1193 method: ${method}`);
      },
      on(event, listener) {
        const eventListeners = listeners.get(event) ?? new Set<Listener>();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
      },
      removeListener(event, listener) {
        listeners.get(event)?.delete(listener);
      },
    };
    provider.providers = [provider];
    Object.defineProperty(window, "ethereum", { configurable: true, value: provider });
    const detail = Object.freeze({
      info: {
        uuid: "350670db-19fa-4704-a166-e52e178b59d2",
        name: "Injected",
        icon: "data:image/svg+xml,<svg xmlns=%27http://www.w3.org/2000/svg%27/>",
        rdns: "io.microcosm.injected",
      },
      provider,
    });
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
    window.addEventListener("eip6963:requestProvider", announce);
    setTimeout(announce, 0);
  }, { address: account.address, chainId: "0x7a0" });
  return account;
}

async function connectWallet(page: Page) {
  const connect = page.getByRole("button", { name: /Connect Wallet/i }).first();
  await expect(connect).toBeVisible();
  await connect.click({ force: true });
  const dialog = page.getByRole("dialog", { name: "Connect a Wallet" });
  await expect(dialog.getByRole("button", { name: /Injected/i })).toBeVisible();
  // Deliberately not `force`. The connector modal renders before React has
  // attached its click handler, and a forced click can land in that window and
  // do nothing at all — which is exactly the intermittent "wallet never
  // connects" failure this suite had been living with. Waiting for
  // actionability makes the click wait for the handler instead.
  await dialog.getByRole("button", { name: /Injected/i }).click();
  await expect(page.getByRole("button", { name: /Sign session/i }).first()).toBeVisible();
}

/** Clears the selected Space without reloading. Reloading here would drop the
 *  wallet session the test has just established. */
async function clearSelectedSpace(page: Page) {
  const picker = page.getByLabel("Active Space");
  if (await picker.locator('option[value=""]').count()) {
    await picker.selectOption("");
    await page.waitForTimeout(600);
  }
}

async function startFromNothing(page: Page) {
  await page.goto("/app");
  await clearSelectedSpace(page);
}

test("the entry gate offers a way in, and no jargon", async ({ page }) => {
  await startFromNothing(page);
  await expect(page.getByRole("heading", { name: "You are not in a Space yet." })).toBeVisible();
  await expect(page.getByText(/Start by connecting a wallet/)).toBeVisible();
  await expect(page.getByText(/Command Center unavailable/)).toHaveCount(0);
});

test("creating a Space sets real limits, funds it, binds the budget, and signs a delegation for the agent", async ({ context, page }) => {
  await installInjectedWallet(context, page);
  // Connect first, exactly as session.spec does. Deselecting the Space before
  // connecting raced the app's re-render and the wallet never settled.
  await page.goto("/app");
  await connectWallet(page);

  // Only now clear the Space, so the gate is what is on screen. No reload: that
  // would drop the session that was just established.
  await clearSelectedSpace(page);

  // Signing happens through the gate, which is where a first-time visitor is
  // told to do it. Waiting for the header's session button instead would test
  // the shell rather than the path.
  const signIn = page.getByRole("button", { name: "Sign in" });
  await expect(signIn).toBeVisible({ timeout: 20000 });
  await signIn.click();
  await expect(page.getByRole("heading", { name: "I was invited" })).toBeVisible({ timeout: 25000 });
  await page.waitForTimeout(600);

  await page.getByRole("button", { name: "Create a Space" }).click();
  await expect(page.getByRole("heading", { name: "Set up a Space." })).toBeVisible();

  await page.getByLabel("What is it called?").fill("Browser Flow Space");
  await page.getByLabel(/What is it for/).fill("Created end to end by the create-Space test.");
  await page.getByRole("button", { name: /Next: who works here/ }).click();

  await page.getByLabel("Name").fill("ProbeVendor");
  await page.getByLabel("Wallet address (optional)").fill("0x1111111111111111111111111111111111111111");
  await page.getByRole("button", { name: "Add them" }).click();
  await expect(page.getByText("ProbeVendor")).toBeVisible();
  await page.getByRole("button", { name: /Next: limits/ }).click();

  await page.getByLabel(/Most any one payment/).fill("300.00");
  await page.getByLabel(/Most it may spend in a day/).fill("1200.00");
  await page.getByRole("button", { name: /Create the Space/ }).click();

  await expect(page.getByText(/maxPerTransaction: 500.00 -> 300.00/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/dailyBudget: 2000.00 -> 1200.00/)).toBeVisible();
  await expect(page.getByText(/Funded with 5000.00/)).toBeVisible();

  await page.getByRole("button", { name: /Sign and bind the budget/ }).click();

  await expect(page.getByText(/Budget bound and signed by/)).toBeVisible({ timeout: 20000 });

  // The last step mints a real delegation for the agent and signs it with the
  // same wallet. This is the part that used to be a warning paragraph.
  await expect(page.getByText(/An agent spends under a delegation you signed/)).toBeVisible();
  await page.getByRole("button", { name: /Sign delegations for your agents/ }).click();

  // The delegation id the agent must present, and the limits it carries.
  const delegationId = page.getByText(/^delegation-/).first();
  await expect(delegationId).toBeVisible({ timeout: 25000 });
  // exact, so it matches the status cell rather than the prose that happens
  // to contain the word "signed"
  await expect(page.getByText("SIGNED", { exact: true })).toBeVisible();
  await expect(page.getByText("Delegated ProbeVendor up to 300.00 per payment, 1200.00 a day")).toBeVisible();

  // The true actorId is the agent's name, not the Space id. The old panel
  // labelled the Space id as the actorId, which was never a member of anything.
  await expect(page.getByText("Its actorId", { exact: true })).toBeVisible();
  await expect(page.getByText("Space id (the agent's actorId)")).toHaveCount(0);

  // And the handoff the agent actually needs.
  await page.getByText("How to hand this to the agent").click();
  await expect(page.getByText(/"delegationId"/)).toBeVisible();

  // The budget binding itself was signed earlier in the flow.
  await page.getByText("The exact budget message that was signed").click();
  await expect(page.getByText(/Microcosm budget binding/)).toBeVisible();
  await expect(page.getByText(/max per transaction: 300.00/)).toBeVisible();
});

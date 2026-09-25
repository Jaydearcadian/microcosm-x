import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hexToString } from "viem";
import type { Hex } from "viem";

async function installInjectedWallet(context: BrowserContext, page: Page) {
  const account = privateKeyToAccount(generatePrivateKey());
  await context.exposeFunction("personalSign", async (message: string, address: string) => {
    if (address.toLowerCase() !== account.address.toLowerCase()) throw new Error("Unexpected signing address.");
    const signableMessage = message.startsWith("0x") ? hexToString(message as Hex) : message;
    return account.signMessage({ message: signableMessage });
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
        if (method === "personal_sign") {
          const [message, signer] = params as [string, string];
          emit("accountsChanged", [address]);
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
  const injected = dialog.getByRole("button", { name: /Injected/i });
  await expect(injected).toBeVisible();
  await dialog.locator("button").filter({ hasText: "Injected" }).click({ force: true, noWaitAfter: true });
  await expect(page.getByRole("button", { name: /Sign session/i }).first()).toBeVisible();
}

test("wallet session persists and redeems the demo invite", async ({ context, page }) => {
  const account = await installInjectedWallet(context, page);
  await page.goto("/app");
  await connectWallet(page);
  await page.getByRole("button", { name: "SIGN SESSION" }).click();
  await expect(page.getByRole("button", { name: "DISCONNECT" })).toBeVisible();

  const createdResponse = await context.request.post("http://127.0.0.1:8788/api/spaces", {
    data: { name: "M7 bearer invite Space", actorId: account.address },
  });
  expect(createdResponse.ok()).toBeTruthy();
  const created = await createdResponse.json() as { space: { id: string } };
  const inviteResponse = await context.request.post(`http://127.0.0.1:8788/api/spaces/${encodeURIComponent(created.space.id)}/invitations`, {
    data: { role: "member", displayName: "Bearer invite member" },
  });
  expect(inviteResponse.ok()).toBeTruthy();
  const invitation = await inviteResponse.json() as { invitation: { code: string; address: string | null } };
  expect(invitation.invitation.address).toBeNull();

  await page.reload();
  await expect(page.getByRole("button", { name: "DISCONNECT" })).toBeVisible();

  await page.goto(`/app/access?code=${encodeURIComponent(invitation.invitation.code)}`);
  await expect(page.getByRole("heading", { name: "Join the Space." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Redeem invite" })).toBeVisible();
  await page.getByRole("button", { name: "Redeem invite" }).click();
  await expect(page.getByRole("status")).toContainText("Access granted to M7 bearer invite Space.");

  await page.goto("/app");
  await page.getByRole("button", { name: "DISCONNECT" }).click();
  await expect(page.getByRole("button", { name: /Connect Wallet/i }).first()).toBeVisible();
});

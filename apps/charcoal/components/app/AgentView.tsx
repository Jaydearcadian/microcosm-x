"use client";

import { useCallback, useEffect, useState } from "react";
import { useSignTypedData } from "wagmi";

import { StatusPill } from "@/components/app/StatusPill";
import { useAppData } from "@/lib/app-data";
import { useWalletSession } from "@/lib/wallet-session";
import {
  createX402Intent,
  fetchCapabilityManifest,
  settleX402Intent,
  signX402Intent,
  validateX402Intent,
  type CapabilityManifest,
  type Eip712TypedData,
  type X402Intent,
  type X402Validation,
} from "@/lib/contract";

import "@/app/views-gov.css";

/* ── formatting ─────────────────────────────────────────────────────────── */

const usd = (value: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value));

const short = (address: string) =>
  address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

/** Whole dollars in the metric row, cents everywhere else. A 34px stat figure
 *  is the width of six or seven characters, and "$2,000.00" is nine: the
 *  exact amount is on the policy rows below, so the headline figure is the
 *  rounded one. views-command.css makes the same call. */
const usdWhole = (value: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));

// MockERC20 (USDC, 6dp) deployed on OKX X Layer testnet — docs/DEMO_RUNBOOK.md
const XLAYER_TESTNET_USDC = "0x6176287b2E80374B41388029f0b87Eb6eeE289e7";

/** What each declared capability is for, in a sentence an operator can check
 *  the manifest against. The manifest names the permission; this says what
 *  the permission buys. */
const CAPABILITY_COPY: Record<string, string> = {
  payment: "Request and settle a bounded payment inside the Space rules.",
  work: "Create a work order and escrow funds from the Space ledger.",
  request: "Raise a request and trace it to a result.",
  court: "Escalate to adjudication when an evaluator cannot settle.",
};

/** A capability is a permission with a name, so the manifest is presented as
 *  a list of permissions: the id, and the sentence that says what the
 *  permission buys. The bound is the same for all of them and is stated once,
 *  under the policy, rather than repeated on every row. */

/* ── the view ────────────────────────────────────────────────────────────── */

export function AgentView() {
  const { spaceId, space, actorId, refresh, loading } = useAppData();
  const { address, isAuthenticated } = useWalletSession();
  const { signTypedDataAsync } = useSignTypedData();

  const [manifest, setManifest] = useState<CapabilityManifest | null>(null);
  const [intents, setIntents] = useState<X402Intent[]>([]);
  const [payloads, setPayloads] = useState<Record<string, Eip712TypedData>>({});
  const [validation, setValidation] = useState<X402Validation | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [amount, setAmount] = useState("350.00");
  const [payTo, setPayTo] = useState("");
  const [asset, setAsset] = useState(XLAYER_TESTNET_USDC);

  const load = useCallback(async () => {
    if (!spaceId) return;
    setFailure(null);
    try {
      setManifest(await fetchCapabilityManifest(spaceId));
    } catch (reason) {
      setFailure(
        reason instanceof Error ? reason.message : "Unable to load the capability manifest.",
      );
    }
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const chainId = space?.chainId ?? 1952;
  const currency = space?.currency ?? "USDC";
  const allowlist = space?.rules.allowedCounterparties ?? [];
  const isAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value);
  const evmAllowlist = allowlist.filter(isAddress);
  const memberAddresses = (space?.members ?? [])
    .map((member) => member.address ?? "")
    .filter(isAddress);
  // x402 refuses a zero payTo: prefer an allowlisted counterparty, else a Space member
  const defaultPayTo = evmAllowlist[0] ?? memberAddresses[0] ?? "";
  const effectivePayTo = isAddress(payTo) ? payTo : defaultPayTo;
  const readyToProbe = Boolean(effectivePayTo && isAddress(asset));

  const buildRequired = useCallback(
    (decimal: string, recipient: string) => ({
      x402Version: 2,
      resource: { url: `https://microcosm.local/spaces/${spaceId}/agent-resource` },
      accepts: [
        {
          scheme: "exact",
          network: `eip155:${chainId}`,
          // x402 amounts are in the asset's smallest unit, and USDC has 6.
          amount: String(Math.round(Number(decimal || "0") * 1_000_000)),
          asset,
          payTo: recipient,
          maxTimeoutSeconds: 30,
        },
      ],
    }),
    [spaceId, chainId, asset],
  );

  const run = useCallback(
    async (key: string, action: () => Promise<string>) => {
      setBusy(key);
      setFailure(null);
      setFlash(null);
      try {
        setFlash(await action());
        await load();
        await refresh();
      } catch (reason) {
        setFailure(reason instanceof Error ? reason.message : "Agent request failed.");
      } finally {
        setBusy(null);
      }
    },
    [load, refresh],
  );

  /** Validates offline: the Space answers whether a payment would be allowed
   *  without a signature and without moving anything. */
  const probe = (overCap: boolean) =>
    run(overCap ? "probe-over" : "probe", async () => {
      const decimal = overCap ? "900.00" : amount || "350.00";
      const result = await validateX402Intent(spaceId, {
        paymentRequired: buildRequired(decimal, effectivePayTo),
        selectedAcceptIndex: 0,
        actorId,
        expectedAssetAddress: asset,
      });
      setValidation(result);
      if (result.policyAllowed) {
        return `x402 v2 payload is protocol-valid and inside Space policy at ${usd(result.selectedAccept?.amountDecimal ?? decimal)}.`;
      }
      return `Refused, as designed: ${result.reasons.join("; ")}`;
    });

  const createIntent = () =>
    run("create", async () => {
      const created = await createX402Intent(spaceId, {
        paymentRequired: buildRequired(amount, effectivePayTo),
        selectedAcceptIndex: 0,
        expectedAssetAddress: asset,
      });
      setPayloads((current) => ({ ...current, [created.intent.intentId]: created.typedData }));
      setIntents((current) => [created.intent, ...current]);
      return `Intent ${created.intent.intentId} created for ${usd(created.intent.amountDecimal)}. It is signed to this session and settles only through a configured facilitator.`;
    });

  const sign = (item: X402Intent) =>
    run(`sign-${item.intentId}`, async () => {
      const data = payloads[item.intentId];
      if (!data) {
        throw new Error(
          "The typed payload for this intent is no longer in this session. Create a new intent to sign it.",
        );
      }
      const signature = await signTypedDataAsync({
        domain: data.domain as {
          name?: string;
          version?: string;
          chainId?: number;
          verifyingContract?: `0x${string}`;
        },
        types: data.types,
        primaryType: data.primaryType,
        message: data.message,
      });
      const signed = await signX402Intent(spaceId, item.intentId, signature, item.digest);
      return `Intent signed and bound to ${short(signed.requesterAddress)}.`;
    });

  const settle = (item: X402Intent) =>
    run(`settle-${item.intentId}`, async () => {
      const settled = await settleX402Intent(spaceId, item.intentId);
      return `Intent is now ${settled.status}.`;
    });

  if (!spaceId) {
    return (
      <div className="app-state">Create or select a Space to publish its agent capabilities.</div>
    );
  }

  const capabilityIds = manifest ? Object.keys(manifest.capabilities) : [];
  const perTransaction = manifest?.policy.maxPerTransaction ?? null;
  const dailyBudget = manifest?.policy.dailyBudget ?? null;
  const allowlistEnforced = manifest?.policy.allowlist.enabled ?? false;

  /** The manifest behind a disclosure, in the shape the API returns it. The
   *  summary above is the readable capability list; this is the document an
   *  operator needs the exact field names from. */
  const manifestDocument = manifest
    ? JSON.stringify(
        {
          space: manifest.space,
          capabilities: manifest.capabilities,
          policy: manifest.policy,
        },
        null,
        2,
      )
    : "";

  return (
    <div className="app-view gov-view">
      <header className="app-view__header">
        <div>
          <span className="eyebrow">Agent surface</span>
          <h1 className="display balance">What an agent may do, published.</h1>
          <p>
            A capability manifest an agent can read before it acts, plus an x402 v2 path that
            validates offline, binds to a session, and refuses to settle without a real
            facilitator.
          </p>
        </div>
        <StatusPill
          label={capabilityIds.length ? `${capabilityIds.length} CAPABILITIES` : "NO MANIFEST"}
          tone={capabilityIds.length ? "active" : "quiet"}
        />
      </header>

      {failure ? (
        <div className="action-flash action-flash--danger" role="status">
          {failure}
        </div>
      ) : null}

      {flash ? (
        <div className="action-flash" role="status">
          {flash}
        </div>
      ) : null}

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Capabilities</span>
            <span className="stat-card__value tnum">{capabilityIds.length}</span>
            <span className="stat-card__note">declared by the Space</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">◈</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Per transaction</span>
            <span className="stat-card__value tnum">
              {perTransaction ? usdWhole(perTransaction) : "—"}
            </span>
            <span className="stat-card__note">as published to agents</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">◵</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Daily budget</span>
            <span className="stat-card__value tnum">{dailyBudget ? usdWhole(dailyBudget) : "—"}</span>
            <span className="stat-card__note">across every agent</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">◴</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Counterparties</span>
            <span className="stat-card__value tnum">{allowlist.length}</span>
            <span className="stat-card__note">named in Space rules</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">◎</span>
          </span>
        </div>
      </div>

      <div className="gov-grid">
        {/* ── what the Space says an agent may do ── */}
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">CAPABILITY MANIFEST</h2>
            <span className="gov-panel__meta truncate">
              {manifest ? `${manifest.space.name} · chain ${manifest.space.chainId}` : "…"}
            </span>
          </div>
          <div className="panel__body">
            <div className="gov-manifest__id">
              <span className="gov-manifest__id-label">SCHEMA</span>
              <span className="gov-manifest__id-value ident">
                {manifest?.schema ?? "microcosm.space.capability-manifest/v1"}
              </span>
            </div>

            {capabilityIds.length === 0 ? (
              <div className="gov-empty">
                <span className="gov-empty__title">
                  {loading ? "Loading manifest…" : "No manifest returned"}
                </span>
                <span>The Space publishes one document listing every capability an agent may ask for.</span>
              </div>
            ) : (
              <div className="agent-caps">
                {capabilityIds.map((id) => (
                  <div className="agent-cap" key={id}>
                    <div className="agent-cap__top">
                      <span className="agent-cap__id truncate">{id}</span>
                    </div>
                    <p className="agent-cap__copy clamp-2">
                      {CAPABILITY_COPY[id] ?? "Declared capability."}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {manifest ? (
              <div className="gov-rows gov-block">
                <div className="gov-row">
                  <span className="gov-row__label">
                    Per transaction
                    <span className="gov-row__of truncate">the most one request may move</span>
                  </span>
                  <span className="gov-row__value">{usd(perTransaction ?? "0")}</span>
                </div>
                <div className="gov-row">
                  <span className="gov-row__label">
                    Daily budget
                    <span className="gov-row__of truncate">across every agent in the Space</span>
                  </span>
                  <span className="gov-row__value">{usd(dailyBudget ?? "0")}</span>
                </div>
                <div className="gov-row">
                  <span className="gov-row__label">
                    Counterparty allowlist
                    <span className="gov-row__of truncate">
                      {allowlistEnforced
                        ? `an agent may only pay ${allowlist.length} named ${allowlist.length === 1 ? "address" : "addresses"}`
                        : "no allowlist: any counterparty is payable"}
                    </span>
                  </span>
                  <span className="gov-row__value">
                    {allowlistEnforced ? "Enforced" : "Open"}
                  </span>
                </div>
              </div>
            ) : null}

            <p className="gov-note gov-note--tight">
              A manifest is what an agent may ask for, not a grant. Every capability above is
              bounded by these three figures, and every request is checked against them again when
              it arrives — a published capability cannot be spent twice.
            </p>

            {manifest ? (
              <details className="gov-disclosure">
                <summary className="gov-disclosure__summary">Show the raw manifest document</summary>
                <pre className="gov-disclosure__code ident">{manifestDocument}</pre>
              </details>
            ) : null}
          </div>
        </section>

        {/* ── ask the Space whether one payment would pass ── */}
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">X402 PROBE</h2>
            <span className="gov-panel__meta truncate">offline validation · nothing moves</span>
          </div>
          <div className="panel__body">
            <div className="gov-form">
              <label className="gov-field">
                <span className="gov-field__label">AMOUNT</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                />
              </label>

              <label className="gov-field">
                <span className="gov-field__label">PAY TO</span>
                <input
                  value={payTo}
                  onChange={(event) => setPayTo(event.target.value)}
                  placeholder={defaultPayTo || "0x…"}
                />
              </label>
              <span className="gov-field__hint">
                {defaultPayTo
                  ? `Defaulting to ${defaultPayTo.slice(0, 10)}… because x402 refuses a zero payTo.`
                  : "This Space has no counterparty or member address to default to, so enter a payTo."}
              </span>

              <label className="gov-field">
                <span className="gov-field__label">ASSET (EIP-20)</span>
                <input value={asset} onChange={(event) => setAsset(event.target.value)} placeholder="0x…" />
              </label>
              <span className="gov-field__hint">
                x402 v2 selects by exact scheme on {currency} (6 decimals) over eip155:{chainId}.
              </span>

              <div className="gov-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void probe(false)}
                  disabled={busy === "probe" || !readyToProbe}
                >
                  {busy === "probe" ? "VALIDATING…" : "Validate in policy"}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => void probe(true)}
                  disabled={busy === "probe-over" || !readyToProbe}
                >
                  {busy === "probe-over" ? "VALIDATING…" : "Try over the cap"}
                </button>
              </div>
            </div>

            {validation ? (
              <div
                className={`agent-verdict ${validation.policyAllowed ? "is-ok" : "is-blocked"}`}
                role="status"
              >
                <div className="agent-verdict__head">
                  <StatusPill
                    label={validation.policyAllowed ? "ALLOWED" : "REFUSED"}
                    tone={validation.policyAllowed ? "active" : "danger"}
                  />
                  <span className="agent-verdict__line truncate">
                    protocol {validation.protocolValid ? "valid" : "invalid"} · policy{" "}
                    {validation.policyAllowed ? "allows" : "denies"}
                    {validation.policyAllowed && validation.selectedAccept
                      ? ` · ${usd(validation.selectedAccept.amountDecimal)} to ${short(validation.selectedAccept.payTo)}`
                      : ""}
                  </span>
                </div>
                {!validation.policyAllowed ? (
                  <span className="agent-verdict__reasons">{validation.reasons.join("; ")}</span>
                ) : (
                  <span className="gov-note">
                    The Space would accept this payment. Nothing has been signed and no money has
                    moved; a signature is still required before an intent can exist.
                  </span>
                )}
              </div>
            ) : (
              <p className="gov-note gov-note--tight">
                A probe is a question, not a payment. It asks the Space whether this payload would
                pass, and the answer comes back with the reason if it would not.
              </p>
            )}

            {isAuthenticated ? (
              <div className="gov-actions gov-block">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => void createIntent()}
                  disabled={busy === "create" || !amount.trim() || !readyToProbe}
                >
                  {busy === "create" ? "CREATING…" : "Create signed intent"}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── the intents this browser session created ── */}
        <section className="panel gov-grid__full">
          <div className="panel__head">
            <h2 className="panel__title">SESSION INTENTS</h2>
            <span className="gov-panel__meta tnum truncate">{intents.length} this session</span>
          </div>
          <div className="panel__body">
            {intents.length === 0 ? (
              <div className="gov-empty">
                <span className="gov-empty__title">No x402 intents in this session</span>
                <span>
                  Intents are session-bound: they are signed to this browser and are not listed for
                  any other actor, because an intent is an offer, not a transfer.
                </span>
              </div>
            ) : (
              <div className="gov-items">
                {intents.map((item) => (
                  <article className="gov-item" key={item.intentId}>
                    <div className="gov-item__head">
                      <div className="gov-item__title">
                        <span className="gov-item__id truncate">{item.intentId}</span>
                        <span className="gov-item__figure tnum">
                          {usd(item.amountDecimal)}
                          <span className="gov-item__figure-unit truncate">{short(item.asset)}</span>
                        </span>
                      </div>
                      <div className="gov-item__pills">
                        {item.status !== "SETTLED" ? (
                          <StatusPill label="SIMULATED" tone="quiet" />
                        ) : null}
                        <StatusPill
                          label={item.status}
                          tone={
                            item.status === "SETTLED"
                              ? "active"
                              : item.status === "REJECTED"
                                ? "danger"
                                : "quiet"
                          }
                        />
                      </div>
                    </div>

                    <div className="gov-item__meta">
                      <span className="truncate">pay to {item.payTo}</span>
                      <span className="truncate">{item.network}</span>
                      <span className="truncate">
                        expires {new Date(item.expiry).toLocaleString("en-US")}
                      </span>
                    </div>

                    <div className="gov-item__foot">
                      <div className="gov-hash">
                        <span className="gov-hash__label">INTENT DIGEST</span>
                        <span className="gov-hash__value ident">{item.digest}</span>
                      </div>

                      <div className="gov-item__actions">
                        {item.status === "PENDING" ? (
                          <button
                            type="button"
                            className="btn btn--primary"
                            onClick={() => void sign(item)}
                            disabled={busy === `sign-${item.intentId}`}
                          >
                            {busy === `sign-${item.intentId}` ? "SIGNING…" : "Sign intent"}
                          </button>
                        ) : null}
                        {item.status === "SIGNED" ? (
                          <button
                            type="button"
                            className="btn btn--secondary"
                            onClick={() => void settle(item)}
                            disabled={busy === `settle-${item.intentId}`}
                          >
                            {busy === `settle-${item.intentId}`
                              ? "REQUESTING…"
                              : "Request settlement"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <p className="gov-note gov-note--tight">
              Settlement is fail-closed: with no facilitator configured, a signed intent returns
              UNSUPPORTED_SETTLEMENT rather than a fabricated receipt. SIMULATED marks an intent
              that is signed but has moved nothing on chain.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSignTypedData } from "wagmi";
import { CardRise } from "@/components/motion";
import { HashChip } from "@/components/HashChip";
import { StatusPill } from "@/components/app/StatusPill";
import { useAppData } from "@/lib/app-data";
import { useWalletSession } from "@/lib/wallet-session";
import {
  createX402Intent, fetchCapabilityManifest, settleX402Intent, signX402Intent, validateX402Intent,
  type CapabilityManifest, type Eip712TypedData, type X402Intent, type X402Validation,
} from "@/lib/contract";

const short = (address: string) => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);
const usd = (value: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(value));

// MockERC20 (USDC, 6dp) deployed on OKX X Layer testnet — docs/DEMO_RUNBOOK.md
const XLAYER_TESTNET_USDC = "0x6176287b2E80374B41388029f0b87Eb6eeE289e7";

const CAPABILITY_COPY: Record<string, string> = {
  payment: "Request and settle a bounded payment inside the Space rules.",
  work: "Create a work order and escrow funds from the Space ledger.",
  request: "Raise a request and trace it to a result.",
  court: "Escalate to adjudication when an evaluator cannot settle.",
};

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
      setFailure(reason instanceof Error ? reason.message : "Unable to load the capability manifest.");
    }
  }, [spaceId]);

  useEffect(() => { void load(); }, [load]);

  const chainId = space?.chainId ?? 1952;
  const currency = space?.currency ?? "USDC";
  const allowlist = space?.rules.allowedCounterparties ?? [];
  const isAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value);
  const evmAllowlist = allowlist.filter(isAddress);
  const memberAddresses = (space?.members ?? []).map((member) => member.address ?? "").filter(isAddress);
  // x402 refuses a zero payTo: prefer an allowlisted counterparty, else a Space member
  const defaultPayTo = evmAllowlist[0] ?? memberAddresses[0] ?? "";
  const effectivePayTo = isAddress(payTo) ? payTo : defaultPayTo;
  const readyToProbe = Boolean(effectivePayTo && isAddress(asset));

  const buildRequired = useCallback((decimal: string, recipient: string) => ({
    x402Version: 2,
    resource: { url: `https://microcosm.local/spaces/${spaceId}/agent-resource` },
    accepts: [{
      scheme: "exact",
      network: `eip155:${chainId}`,
      amount: String(Math.round(Number(decimal || "0") * 1_000_000)),
      asset,
      payTo: recipient,
      maxTimeoutSeconds: 30,
    }],
  }), [spaceId, chainId, asset]);

  const run = useCallback(async (key: string, action: () => Promise<string>) => {
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
  }, [load, refresh]);

  const probe = (overCap: boolean) => run(overCap ? "probe-over" : "probe", async () => {
    const decimal = overCap ? "900.00" : amount || "350.00";
    const result = await validateX402Intent(spaceId, {
      paymentRequired: buildRequired(decimal, effectivePayTo),
      selectedAcceptIndex: 0,
      actorId,
      expectedAssetAddress: asset,
    });
    setValidation(result);
    if (result.policyAllowed) return `x402 v2 payload is protocol-valid and inside Space policy at ${usd(result.selectedAccept?.amountDecimal ?? decimal)}.`;
    return `Refused, as designed: ${result.reasons.join("; ")}`;
  });

  const createIntent = () => run("create", async () => {
    const created = await createX402Intent(spaceId, {
      paymentRequired: buildRequired(amount, effectivePayTo),
      selectedAcceptIndex: 0,
      expectedAssetAddress: asset,
    });
    setPayloads((current) => ({ ...current, [created.intent.intentId]: created.typedData }));
    setIntents((current) => [created.intent, ...current]);
    return `Intent ${created.intent.intentId} created for ${usd(created.intent.amountDecimal)}. It is signed to this session and settles only through a configured facilitator.`;
  });

  const sign = (item: X402Intent) => run(`sign-${item.intentId}`, async () => {
    const data = payloads[item.intentId];
    if (!data) throw new Error("The typed payload for this intent is no longer in this session. Create a new intent to sign it.");
    const signature = await signTypedDataAsync({
      domain: data.domain as { name?: string; version?: string; chainId?: number; verifyingContract?: `0x${string}` },
      types: data.types,
      primaryType: data.primaryType,
      message: data.message,
    });
    const signed = await signX402Intent(spaceId, item.intentId, signature, item.digest);
    return `Intent signed and bound to ${short(signed.requesterAddress)}.`;
  });

  const settle = (item: X402Intent) => run(`settle-${item.intentId}`, async () => {
    const settled = await settleX402Intent(spaceId, item.intentId);
    return `Intent is now ${settled.status}.`;
  });

  if (!spaceId) return <div className="app-state">Create or select a Space to publish its agent capabilities.</div>;
  const capabilityIds = Object.keys(manifest?.capabilities ?? {});

  return <div className="app-view">
    <header className="app-view__header">
      <div>
        <span className="eyebrow">AGENT SURFACE</span>
        <h1 className="display">What an agent may do, published.</h1>
        <p>A sanitized capability manifest plus an x402 v2 path that validates offline, binds to a session, and refuses to settle without a real facilitator.</p>
      </div>
      <StatusPill label={capabilityIds.length ? `${capabilityIds.length} CAPABILITIES` : "NO MANIFEST"} tone={capabilityIds.length ? "active" : "quiet"} />
    </header>

    {failure && <div className="action-flash action-flash--danger" role="status">{failure}</div>}
    {flash && <div className="action-flash" role="status">{flash}</div>}

    <div className="gov-grid">
      <CardRise className="command-panel">
        <div className="command-panel__head"><span className="eyebrow">CAPABILITY MANIFEST</span><span className="font-ui muted" style={{ fontSize: 10 }}>{manifest?.schema ?? "…"}</span></div>
        <div className="agent-caps">
          {capabilityIds.map((id) => <div className="agent-cap" key={id}><span className="font-ui">{id}</span><p>{CAPABILITY_COPY[id] ?? "Declared capability."}</p></div>)}
          {capabilityIds.length === 0 && <p className="muted">{loading ? "Loading manifest…" : "No manifest returned."}</p>}
        </div>
        {manifest && <div className="gov-readout">
          <strong className="font-ui">{usd(manifest.policy.maxPerTransaction ?? "0")} / {usd(manifest.policy.dailyBudget ?? "0")}</strong>
          <span>per transaction / daily, as published to agents · counterparty allowlist {manifest.policy.allowlist.enabled ? "enforced" : "open"}</span>
        </div>}
      </CardRise>

      <CardRise delay={0.08} className="command-panel">
        <div className="command-panel__head"><span className="eyebrow">X402 V2 PROBE</span><span className="muted" style={{ fontSize: 11 }}>offline validation</span></div>
        <div className="gov-config">
          <label className="wizard-field">AMOUNT<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label>
          <label className="wizard-field">PAY TO<input value={payTo} onChange={(event) => setPayTo(event.target.value)} placeholder={defaultPayTo || "0x…"} /></label>
          <p className="muted" style={{ fontSize: 12 }}>{defaultPayTo ? `Defaulting to ${defaultPayTo.slice(0, 10)}… because x402 refuses a zero payTo.` : "This Space has no counterparty or member address to default to, so enter a payTo."}</p>
          <label className="wizard-field">ASSET (EIP-20)<input value={asset} onChange={(event) => setAsset(event.target.value)} placeholder="0x…" /></label>
          <p className="muted" style={{ fontSize: 12 }}>x402 v2 selects by exact scheme on {currency} (6 decimals) over eip155:{chainId}.</p>
          <div className="wizard-actions">
            <button type="button" className="wizard-run" onClick={() => void probe(false)} disabled={busy === "probe" || !readyToProbe}>{busy === "probe" ? "VALIDATING…" : "Validate in policy"}</button>
            <button type="button" className="wizard-run" onClick={() => void probe(true)} disabled={busy === "probe-over" || !readyToProbe}>{busy === "probe-over" ? "VALIDATING…" : "Try over the cap"}</button>
          </div>
        </div>
        {validation && <div className={`agent-verdict ${validation.policyAllowed ? "is-ok" : "is-blocked"}`}>
          <strong>{validation.policyAllowed ? "ALLOWED" : "REFUSED"}</strong>
          <span>protocol {validation.protocolValid ? "valid" : "invalid"} · policy {validation.policyAllowed ? "allows" : "denies"}</span>
          {!validation.policyAllowed && <span className="agent-verdict__reasons">{validation.reasons.join("; ")}</span>}
        </div>}
        {isAuthenticated && <div className="wizard-actions" style={{ marginTop: 16 }}>
          <button type="button" className="wizard-run" onClick={() => void createIntent()} disabled={busy === "create" || !amount.trim() || !readyToProbe}>{busy === "create" ? "CREATING…" : "Create signed intent"}</button>
        </div>}
      </CardRise>
    </div>

    <CardRise delay={0.14} className="command-panel gov-queue">
      <div className="command-panel__head"><span className="eyebrow">SESSION INTENTS</span><span className="muted" style={{ fontSize: 11 }}>{intents.length} this session</span></div>
      {intents.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No x402 intents created in this browser session. Intents are session-bound and are not listed for other actors.</p>}
      {intents.map((item) => <article className="gov-item" key={item.intentId}>
        <div className="gov-item__head">
          <div><span className="eyebrow">{item.intentId}</span><strong className="display" style={{ fontSize: 22 }}>{usd(item.amountDecimal)} <span className="muted" style={{ fontSize: 15 }}>{item.asset}</span></strong></div>
          <StatusPill label={item.status} tone={item.status === "SETTLED" ? "active" : item.status === "REJECTED" ? "danger" : "quiet"} />
        </div>
        <div className="gov-item__meta">
          <span>pay to {short(item.payTo)}</span>
          <span>{item.network}</span>
          <span>expires {new Date(item.expiry).toLocaleString("en-US")}</span>
        </div>
        <div className="gov-item__foot">
          <HashChip hash={item.digest} kind="proof" label="INTENT DIGEST" />
          <div className="gov-item__actions">
            {item.status === "PENDING" && <button type="button" className="wizard-run" onClick={() => void sign(item)} disabled={busy === `sign-${item.intentId}`}>{busy === `sign-${item.intentId}` ? "SIGNING…" : "Sign intent"}</button>}
            {item.status === "SIGNED" && <button type="button" className="wizard-run" onClick={() => void settle(item)} disabled={busy === `settle-${item.intentId}`}>{busy === `settle-${item.intentId}` ? "REQUESTING…" : "Request settlement"}</button>}
          </div>
        </div>
      </article>)}
      <p className="muted" style={{ marginTop: 18, fontSize: 12 }}>Settlement is fail-closed: with no facilitator configured, a signed intent returns UNSUPPORTED_SETTLEMENT rather than a fabricated receipt.</p>
    </CardRise>
  </div>;
}

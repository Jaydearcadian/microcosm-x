"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSignTypedData } from "wagmi";
import { CardRise } from "@/components/motion";
import { HashChip } from "@/components/HashChip";
import { StatusPill } from "@/components/app/StatusPill";
import { useAppData } from "@/lib/app-data";
import { useWalletSession } from "@/lib/wallet-session";
import {
  createDelegation, fetchDelegations, revokeDelegation, signDelegation, verifyDelegation,
  type AuthorityDelegation, type Eip712TypedData,
} from "@/lib/contract";

const short = (address: string) => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);
const usd = (value: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(value));
const hex = (bytes: number) => `0x${Array.from({ length: bytes }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;

function EnvelopeRow({ label, cap, budget, counterparties, tone }: { label: string; cap: string; budget: string; counterparties: string[]; tone: "parent" | "child" }) {
  return <div className={`deleg-envelope deleg-envelope--${tone}`}>
    <span className="eyebrow">{label}</span>
    <div className="deleg-envelope__row"><span>Per transaction</span><strong className="font-ui">{usd(cap)}</strong></div>
    <div className="deleg-envelope__row"><span>Daily budget</span><strong className="font-ui">{usd(budget)}</strong></div>
    <div className="deleg-envelope__row"><span>Counterparties</span><strong className="font-ui">{counterparties.length || "any"}</strong></div>
  </div>;
}

export function DelegationView() {
  const { spaceId, space, bounds, refresh, loading } = useAppData();
  const { address, isAuthenticated } = useWalletSession();
  const { signTypedDataAsync } = useSignTypedData();
  const [delegations, setDelegations] = useState<AuthorityDelegation[]>([]);
  const [payloads, setPayloads] = useState<Record<string, Eip712TypedData>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [child, setChild] = useState("");
  const [childRole, setChildRole] = useState("agent");
  const [cap, setCap] = useState("");
  const [budget, setBudget] = useState("");
  const [counterparties, setCounterparties] = useState("");
  const [validity, setValidity] = useState("3600");

  const load = useCallback(async () => {
    if (!spaceId) return;
    // delegations are session-bound, so stay read-only rather than surfacing a 401
    if (!isAuthenticated) {
      setFailure(null);
      setDelegations([]);
      return;
    }
    setFailure(null);
    try {
      setDelegations(await fetchDelegations(spaceId));
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Unable to load delegations.");
    }
  }, [spaceId]);

  useEffect(() => { void load(); }, [load]);

  const parentCap = bounds?.maxPerTransaction ?? space?.rules.maxPerTransaction ?? "0";
  const parentBudget = bounds?.dailyBudget ?? space?.rules.dailyBudget ?? "0";

  // mirrors the server's subset proof so escalation is visible before submitting
  const escalation = useMemo(() => {
    const reasons: string[] = [];
    if (cap && Number(cap) > Number(parentCap)) reasons.push(`cap ${usd(cap)} exceeds parent cap ${usd(parentCap)}`);
    if (budget && Number(budget) > Number(parentBudget)) reasons.push(`daily budget ${usd(budget)} exceeds parent budget ${usd(parentBudget)}`);
    const parentSet = new Set((space?.rules.allowedCounterparties ?? []).map((entry) => entry.toLowerCase()));
    const requested = counterparties.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    if (parentSet.size && requested.some((entry) => !parentSet.has(entry))) reasons.push("a requested counterparty is outside the parent allowlist");
    return reasons;
  }, [cap, budget, counterparties, parentCap, parentBudget, space]);

  const run = useCallback(async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setFailure(null);
    setFlash(null);
    try {
      setFlash(await action());
      await load();
      await refresh();
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Delegation action failed.");
    } finally {
      setBusy(null);
    }
  }, [load, refresh]);

  const issue = () => run("issue", async () => {
    const now = Math.floor(Date.now() / 1000);
    const created = await createDelegation(spaceId, {
      delegationId: `delegation-${hex(6)}`,
      child: child.trim(),
      childRole,
      maxPerTransaction: cap.trim(),
      dailyBudget: budget.trim(),
      allowedCounterparties: counterparties.split(",").map((entry) => entry.trim()).filter(Boolean),
      nonce: String(now),
      expiry: String(now + Number(validity || "3600")),
      policySnapshotHash: `0x${"0".repeat(64)}`,
    });
    setPayloads((current) => ({ ...current, [created.delegation.delegationId]: created.typedData }));
    setChild(""); setCap(""); setBudget(""); setCounterparties("");
    return `Envelope ${created.delegation.delegationId} created. Subset proof ${created.proof.valid ? "passed" : "failed"}, so it can only narrow. Sign it to activate.`;
  });

  const sign = (item: AuthorityDelegation) => run(`sign-${item.delegationId}`, async () => {
    const data = payloads[item.delegationId] ?? item.typedData;
    if (!data) throw new Error("The EIP-712 payload for this envelope is no longer available. Create a new delegation to sign it.");
    const signature = await signTypedDataAsync({
      domain: data.domain as { name?: string; version?: string; chainId?: number; verifyingContract?: `0x${string}` },
      types: data.types,
      primaryType: data.primaryType,
      message: data.message,
    });
    const signed = await signDelegation(spaceId, item.delegationId, signature, item.digest);
    return `Signed by ${short(signed.signedBy ?? "")}. The child may now act only inside this envelope.`;
  });

  const verify = (item: AuthorityDelegation) => run(`verify-${item.delegationId}`, async () => {
    const result = await verifyDelegation(spaceId, item.delegationId);
    return `Verification passed. Signer ${short(result.signer)}, digest ${result.digest.slice(0, 10)}…, status ${result.status}.`;
  });

  const revoke = (item: AuthorityDelegation) => run(`revoke-${item.delegationId}`, async () => {
    const revoked = await revokeDelegation(spaceId, item.delegationId);
    return `Revoked by ${short(revoked.revokedBy ?? "")}. The child can no longer act under this envelope.`;
  });

  if (!spaceId) return <div className="app-state">Create or select a Space to delegate authority.</div>;
  const active = delegations.filter((item) => item.status === "SIGNED");
  const inactive = delegations.filter((item) => item.status !== "SIGNED");

  return <div className="app-view">
    <header className="app-view__header">
      <div>
        <span className="eyebrow">DELEGATION</span>
        <h1 className="display">Authority narrows. It never grows.</h1>
        <p>A signed envelope can only reduce a child actor&rsquo;s cap, budget, and counterparties. Expansion is rejected by a subset proof, not by review.</p>
      </div>
      <StatusPill label={active.length ? `${active.length} ACTIVE` : "NO ACTIVE ENVELOPES"} tone={active.length ? "active" : "quiet"} />
    </header>

    {failure && <div className="action-flash action-flash--danger" role="status">{failure}</div>}
    {!isAuthenticated && <div className="action-flash" role="status">Delegations are session-bound. Connect a wallet and sign the session to see this Space's envelopes and to sign, verify, or revoke one.</div>}
    {flash && <div className="action-flash" role="status">{flash}</div>}

    <div className="gov-grid">
      <CardRise className="command-panel">
        <div className="command-panel__head"><span className="eyebrow">PARENT ENVELOPE</span><span className="muted" style={{ fontSize: 11 }}>this Space</span></div>
        <div className="deleg-compare">
          <EnvelopeRow label={`SPACE · ${space?.name ?? ""}`} cap={parentCap} budget={parentBudget} counterparties={space?.rules.allowedCounterparties ?? []} tone="parent" />
        </div>
        <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>Every envelope below must sit inside this one. The server recomputes the subset proof on create and refuses anything larger.</p>
      </CardRise>

      <CardRise delay={0.08} className="command-panel">
        <div className="command-panel__head"><span className="eyebrow">ISSUE A NARROWER ENVELOPE</span><span className="muted" style={{ fontSize: 11 }}>EIP-712</span></div>
        {isAuthenticated ? <>
          <div className="gov-config">
            <label className="wizard-field">CHILD ADDRESS<input value={child} onChange={(event) => setChild(event.target.value)} placeholder="0x…" /></label>
            <label className="wizard-field">CHILD ROLE<select value={childRole} onChange={(event) => setChildRole(event.target.value)}><option value="agent">Agent</option><option value="operator">Operator</option></select></label>
            <label className="wizard-field">MAX PER TRANSACTION<input value={cap} onChange={(event) => setCap(event.target.value)} inputMode="decimal" placeholder={parentCap} /></label>
            <label className="wizard-field">DAILY BUDGET<input value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" placeholder={parentBudget} /></label>
            <label className="wizard-field">COUNTERPARTIES (comma separated)<input value={counterparties} onChange={(event) => setCounterparties(event.target.value)} placeholder="blank inherits the parent set" /></label>
            <label className="wizard-field">VALID FOR (SECONDS)<input value={validity} onChange={(event) => setValidity(event.target.value)} inputMode="numeric" /></label>
            {escalation.length > 0 && <div className="deleg-escalation" role="status"><strong>ESCALATION BLOCKED</strong><span>{escalation.join(" · ")}</span></div>}
            <div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void issue()} disabled={busy === "issue" || escalation.length > 0 || !child.trim() || !cap.trim() || !budget.trim()}>{busy === "issue" ? "ISSUING…" : "Create envelope"}</button></div>
          </div>
        </> : <p className="muted">Connect and sign a session as an admin, agent, or operator to issue an envelope.</p>}
      </CardRise>
    </div>

    <CardRise delay={0.14} className="command-panel gov-queue">
      <div className="command-panel__head"><span className="eyebrow">ENVELOPES</span><span className="muted" style={{ fontSize: 11 }}>{delegations.length} total</span></div>
      {delegations.length === 0 && <p className="muted" style={{ marginTop: 16 }}>{loading ? "Loading envelopes…" : "No delegation envelopes in this Space yet."}</p>}
      {[...active, ...inactive].map((item) => {
        const mine = Boolean(isAuthenticated && address && item.parentActor.toLowerCase() === address.toLowerCase());
        return <article className="gov-item" key={item.delegationId}>
          <div className="gov-item__head">
            <div><span className="eyebrow">{item.delegationId}</span><strong className="display" style={{ fontSize: 22 }}>{short(item.parentActor)} <span className="muted" style={{ fontSize: 15 }}>&rarr; {item.childRole} {short(item.child)}</span></strong></div>
            <StatusPill label={item.status} tone={item.status === "SIGNED" ? "active" : item.status === "REVOKED" || item.status === "EXPIRED" ? "danger" : "quiet"} />
          </div>
          <div className="deleg-compare">
            <EnvelopeRow label="PARENT" cap={parentCap} budget={parentBudget} counterparties={space?.rules.allowedCounterparties ?? []} tone="parent" />
            <EnvelopeRow label="CHILD ENVELOPE" cap={item.maxPerTransaction} budget={item.dailyBudget} counterparties={item.allowedCounterparties} tone="child" />
          </div>
          <div className="gov-item__meta">
            <span>asset {item.asset}</span>
            <span>chain {item.chainId}</span>
            <span>expires {new Date(item.expiryAt).toLocaleString("en-US")}</span>
            {item.signedAt && <span>signed {new Date(item.signedAt).toLocaleString("en-US")}</span>}
          </div>
          <div className="gov-item__foot">
            <HashChip hash={item.digest} kind="proof" label="EIP-712 DIGEST" />
            <div className="gov-item__actions">
              {item.status === "PENDING" && mine && <button type="button" className="wizard-run" onClick={() => void sign(item)} disabled={busy === `sign-${item.delegationId}`}>{busy === `sign-${item.delegationId}` ? "SIGNING…" : "Sign envelope"}</button>}
              {item.status === "SIGNED" && <button type="button" className="wizard-run" onClick={() => void verify(item)} disabled={busy === `verify-${item.delegationId}`}>{busy === `verify-${item.delegationId}` ? "VERIFYING…" : "Verify"}</button>}
              {(item.status === "PENDING" || item.status === "SIGNED") && mine && <button type="button" className="wizard-run" onClick={() => void revoke(item)} disabled={busy === `revoke-${item.delegationId}`}>{busy === `revoke-${item.delegationId}` ? "REVOKING…" : "Revoke"}</button>}
            </div>
          </div>
        </article>;
      })}
    </CardRise>
  </div>;
}

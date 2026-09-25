"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSignTypedData } from "wagmi";
import { CardRise } from "@/components/motion";
import { HashChip } from "@/components/HashChip";
import { StatusPill } from "@/components/app/StatusPill";
import { useAppData } from "@/lib/app-data";
import { useWalletSession } from "@/lib/wallet-session";
import {
  configureGovernance, createGovernancePayment, executeGovernanceRequest, fetchGovernanceConfig,
  fetchGovernanceRequests, signGovernanceRequest,
  type Eip712TypedData, type GovernanceConfig, type GovernanceRequest,
} from "@/lib/contract";

const short = (address: string) => (address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address);
const usd = (value: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(value));
const day = 86_400_000;

function QuorumMeter({ approvals, threshold }: { approvals: number; threshold: number }) {
  return <div className="gov-quorum" role="img" aria-label={`${approvals} of ${threshold} approvals`}>
    {Array.from({ length: Math.max(threshold, approvals) }, (_, index) => <i key={index} className={index < approvals ? "is-met" : ""} />)}
    <span className="font-ui">{approvals}/{threshold}</span>
  </div>;
}

export function GovernanceView() {
  const { spaceId, space, refresh, loading } = useAppData();
  const { address, isAuthenticated } = useWalletSession();
  const { signTypedDataAsync } = useSignTypedData();
  const [config, setConfig] = useState<GovernanceConfig | null>(null);
  const [requests, setRequests] = useState<GovernanceRequest[]>([]);
  const [typedData, setTypedData] = useState<Record<string, Eip712TypedData>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [threshold, setThreshold] = useState("2");
  const [allowlist, setAllowlist] = useState("");

  const load = useCallback(async () => {
    if (!spaceId) return;
    // these routes are session-bound, so stay read-only rather than surfacing a 401
    if (!isAuthenticated) {
      setFailure(null);
      setConfig(null);
      setRequests([]);
      return;
    }
    setFailure(null);
    try {
      const [nextConfig, nextRequests] = await Promise.all([fetchGovernanceConfig(spaceId), fetchGovernanceRequests(spaceId)]);
      setConfig(nextConfig);
      setRequests(nextRequests);
      setThreshold(String(nextConfig?.threshold ?? 2));
      setAllowlist((nextConfig?.signerAllowlist ?? []).join(", "));
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Unable to load governance state.");
    }
  }, [spaceId]);

  useEffect(() => { void load(); }, [load]);

  const signer = useMemo(() => {
    if (!address || !config) return false;
    return config.signerAllowlist.some((entry) => entry.toLowerCase() === address.toLowerCase());
  }, [address, config]);

  const run = useCallback(async (key: string, action: () => Promise<string>) => {
    setBusy(key);
    setFailure(null);
    setFlash(null);
    try {
      setFlash(await action());
      await load();
      await refresh();
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Governance action failed.");
    } finally {
      setBusy(null);
    }
  }, [load, refresh]);

  const propose = () => run("propose", async () => {
    const created = await createGovernancePayment(spaceId, { recipient: recipient.trim(), amount: amount.trim(), memo: memo.trim(), deadline: new Date(Date.now() + day).toISOString() });
    setTypedData((current) => ({ ...current, [created.request.requestId]: created.typedData }));
    setRecipient(""); setAmount(""); setMemo("");
    return `Request ${created.request.requestId} queued. It needs ${config?.threshold ?? 2} approvals before it can execute.`;
  });

  const sign = (request: GovernanceRequest) => run(`sign-${request.requestId}`, async () => {
    const data = typedData[request.requestId];
    if (!data) throw new Error("The EIP-712 payload for this request expired. Re-create the request to sign it again.");
    const signature = await signTypedDataAsync({
      domain: data.domain as { name?: string; version?: string; chainId?: number; verifyingContract?: `0x${string}` },
      types: data.types,
      primaryType: data.primaryType,
      message: data.message,
    });
    const signed = await signGovernanceRequest(spaceId, request.requestId, signature);
    return `Approval recorded from ${short(signed.approvals[signed.approvals.length - 1]?.signerAddress ?? "")}. ${signed.approvals.length}/${config?.threshold ?? 2} collected.`;
  });

  const execute = (request: GovernanceRequest) => run(`execute-${request.requestId}`, async () => {
    const result = await executeGovernanceRequest(spaceId, request.requestId);
    return `Executed. Status ${result.status}${result.receipt?.txHash ? ` · tx ${result.receipt.txHash.slice(0, 10)}…` : ""}.`;
  });

  const saveConfig = () => run("config", async () => {
    const signers = allowlist.split(",").map((entry) => entry.trim()).filter(Boolean);
    const next = await configureGovernance(spaceId, { threshold: Number(threshold), signerAllowlist: signers });
    return `Governance set to ${next.threshold}-of-${next.signerAllowlist.length} across ${next.signerAllowlist.length} allowlisted signers.`;
  });

  if (!spaceId) return <div className="app-state">Create or select a Space to configure governance.</div>;
  const pending = requests.filter((item) => item.status === "PENDING");
  const settled = requests.filter((item) => item.status !== "PENDING");

  return <div className="app-view">
    <header className="app-view__header">
      <div>
        <span className="eyebrow">GOVERNANCE</span>
        <h1 className="display">Rules move by signature.</h1>
        <p>A Space payment leaves the ledger only after {config?.threshold ?? 2} of {config?.signerAllowlist.length ?? 0} allowlisted signers approve the same EIP-712 digest.</p>
      </div>
      <StatusPill label={config?.enabled === false ? "GOVERNANCE OFF" : pending.length ? `${pending.length} PENDING` : "QUEUE CLEAR"} tone={config?.enabled === false ? "danger" : pending.length ? "active" : "quiet"} />
    </header>

    {failure && <div className="action-flash action-flash--danger" role="status">{failure}</div>}
    {!isAuthenticated && <div className="action-flash" role="status">Governance is session-bound. Connect a wallet and sign the session to see this Space's quorum, its approval queue, and to cast a vote.</div>}
    {flash && <div className="action-flash" role="status">{flash}</div>}

    <div className="gov-grid">
      <CardRise className="command-panel">
        <div className="command-panel__head"><span className="eyebrow">QUORUM</span><span className="muted" style={{ fontSize: 11 }}>{space?.network} · {space?.chainId}</span></div>
        {config ? <>
          <div className="gov-readout"><strong className="font-ui">{config.threshold}-of-{config.signerAllowlist.length}</strong><span>threshold required to execute a Space payment</span></div>
          <div className="gov-signers">
            {config.signerAllowlist.map((entry) => {
              const approved = requests.some((item) => item.approvals.some((a) => a.signerAddress.toLowerCase() === entry.toLowerCase()) && item.status === "PENDING");
              return <div className="gov-signer" key={entry}><span className="font-ui">{short(entry)}</span><em className={approved ? "is-met" : ""}>{approved ? "APPROVED" : "ELIGIBLE"}</em></div>;
            })}
          </div>
          {isAuthenticated && (
            <div className="gov-config">
              <label className="wizard-field">THRESHOLD<input value={threshold} inputMode="numeric" onChange={(event) => setThreshold(event.target.value)} /></label>
              <label className="wizard-field">SIGNER ALLOWLIST (comma separated)<input value={allowlist} onChange={(event) => setAllowlist(event.target.value)} placeholder="0xabc…, 0xdef…" /></label>
              <div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void saveConfig()} disabled={busy === "config"}>{busy === "config" ? "SAVING…" : "Save quorum"}</button></div>
            </div>
          )}
        </> : <p className="muted">{loading ? "Loading quorum…" : failure ? "Governance is not configured for this Space." : "No governance configured."}</p>}
      </CardRise>

      <CardRise delay={0.08} className="command-panel">
        <div className="command-panel__head"><span className="eyebrow">PROPOSE A SPACE PAYMENT</span><span className="muted" style={{ fontSize: 11 }}>non-cap payments only</span></div>
        {isAuthenticated ? <>
          <div className="gov-readout"><strong className="font-ui">{signer ? "SIGNER" : "REQUESTER"}</strong><span>{signer ? "your address is on the allowlist, so you can approve" : "you can propose; approvals need an allowlisted signer"}</span></div>
          <div className="gov-config">
            <label className="wizard-field">RECIPIENT<input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x…" /></label>
            <label className="wizard-field">AMOUNT<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="250.00" /></label>
            <label className="wizard-field">MEMO<input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="why this leaves the Space" /></label>
            <div className="wizard-actions"><button type="button" className="wizard-run" onClick={() => void propose()} disabled={busy === "propose" || !recipient.trim() || !amount.trim()}>{busy === "propose" ? "QUEUEING…" : "Queue for approval"}</button></div>
          </div>
        </> : <p className="muted">Connect and sign a session to propose or approve a payment.</p>}
      </CardRise>
    </div>

    <CardRise delay={0.14} className="command-panel gov-queue">
      <div className="command-panel__head"><span className="eyebrow">APPROVAL QUEUE</span><span className="muted" style={{ fontSize: 11 }}>{requests.length} total</span></div>
      {requests.length === 0 && <p className="muted" style={{ marginTop: 16 }}>No governance requests in this Space yet.</p>}
      {requests.map((item) => {
        const approvals = item.approvals.length;
        const ready = approvals >= (config?.threshold ?? 2);
        const alreadySigned = item.approvals.some((a) => a.signerAddress.toLowerCase() === (address ?? "").toLowerCase());
        const canSign = isAuthenticated && signer && !alreadySigned && Boolean(typedData[item.requestId]);
        return <article className="gov-item" key={item.requestId}>
          <div className="gov-item__head">
            <div><span className="eyebrow">{item.requestId}</span><strong className="display" style={{ fontSize: 22 }}>{usd(item.amount)} <span className="muted" style={{ fontSize: 15 }}>{item.asset}</span></strong></div>
            <StatusPill label={item.status} tone={item.status === "EXECUTED" ? "active" : item.status === "PENDING" ? (ready ? "active" : "quiet") : "quiet"} />
          </div>
          <div className="gov-item__meta">
            <span>to {short(item.recipient)}</span>
            <span>by {short(item.requesterAddress)}</span>
            <span>expires {new Date(item.deadline).toLocaleString("en-US")}</span>
          </div>
          {item.memo && <p className="gov-item__memo">{item.memo}</p>}
          <div className="gov-item__foot">
            <QuorumMeter approvals={approvals} threshold={config?.threshold ?? 2} />
            <HashChip hash={item.digest} kind="transaction" label="EIP-712 DIGEST" />
            <div className="gov-item__actions">
              {canSign && <button type="button" className="wizard-run" onClick={() => void sign(item)} disabled={busy === `sign-${item.requestId}`}>{busy === `sign-${item.requestId}` ? "SIGNING…" : "Sign approval"}</button>}
              {item.status === "PENDING" && ready && <button type="button" className="wizard-run" onClick={() => void execute(item)} disabled={busy === `execute-${item.requestId}`}>{busy === `execute-${item.requestId}` ? "EXECUTING…" : "Execute payment"}</button>}
              {item.status === "PENDING" && !ready && <span className="muted" style={{ fontSize: 12 }}>waiting on {Math.max((config?.threshold ?? 2) - approvals, 0)} more approval(s)</span>}
              {item.receipt?.txHash && <HashChip hash={item.receipt.txHash} kind="transaction" label="SETTLED" />}
            </div>
          </div>
        </article>;
      })}
      {settled.length > 0 && <p className="muted" style={{ marginTop: 18, fontSize: 12 }}>{settled.length} settled or rejected request(s) retained for audit.</p>}
    </CardRise>
  </div>;
}

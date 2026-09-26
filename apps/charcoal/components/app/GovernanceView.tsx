"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSignTypedData } from "wagmi";

import { StatusPill } from "@/components/app/StatusPill";
import { useAppData } from "@/lib/app-data";
import { useWalletSession } from "@/lib/wallet-session";
import {
  configureGovernance,
  createGovernancePayment,
  executeGovernanceRequest,
  fetchGovernanceConfig,
  fetchGovernanceRequests,
  signGovernanceRequest,
  type Eip712TypedData,
  type GovernanceConfig,
  type GovernanceRequest,
} from "@/lib/contract";

import "@/app/views-gov.css";

/* ── formatting ─────────────────────────────────────────────────────────── */

/** Two decimal places on every figure: these are payment amounts, and a
 *  request that reads $250 beside one that reads $250.00 looks like two
 *  different requests. */
const usd = (value: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value));

/** Addresses are quoted back in a flash message, where there is no room for 42
 *  characters and the whole string is not what the reader needs. */
const short = (address: string) =>
  address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

/** A queued payment expires on its own; the deadline is 24h out. */
const day = 86_400_000;

/* ── the quorum meter ──────────────────────────────────────────────────────
   Threshold and signatures as one row of cells: filled once an allowlisted
   signer has approved this request, hollow until then. The count beside it is
   the same fact in figures, for a reader who would rather not count. */

function QuorumMeter({ approvals, threshold }: { approvals: number; threshold: number }) {
  const cells = Math.max(threshold, approvals);
  return (
    <div
      className="gov-quorum"
      role="img"
      aria-label={`${approvals} of ${threshold} signatures collected`}
    >
      <span className="gov-quorum__dots" aria-hidden="true">
        {Array.from({ length: cells }, (_, index) => (
          <i key={index} className={`gov-quorum__dot${index < approvals ? " is-met" : ""}`} />
        ))}
      </span>
      <span className="gov-quorum__count tnum truncate">
        {approvals}/{threshold} signatures
      </span>
    </div>
  );
}

/* ── the view ────────────────────────────────────────────────────────────── */

export function GovernanceView() {
  const { spaceId, space, refresh, loading } = useAppData();
  const { address, isAuthenticated } = useWalletSession();
  const { signTypedDataAsync } = useSignTypedData();

  const [config, setConfig] = useState<GovernanceConfig | null>(null);
  const [requests, setRequests] = useState<GovernanceRequest[]>([]);
  /** EIP-712 payloads, keyed by request id, held for this session only: the
   *  signature is over exactly these bytes, so a request that was reloaded
   *  rather than raised here cannot be signed from this view. */
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
      const [nextConfig, nextRequests] = await Promise.all([
        fetchGovernanceConfig(spaceId),
        fetchGovernanceRequests(spaceId),
      ]);
      setConfig(nextConfig);
      setRequests(nextRequests);
      setThreshold(String(nextConfig?.threshold ?? 2));
      setAllowlist((nextConfig?.signerAllowlist ?? []).join(", "));
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Unable to load governance state.");
    }
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Whether the connected address may cast an approval at all. */
  const signer = useMemo(() => {
    if (!address || !config) return false;
    return config.signerAllowlist.some((entry) => entry.toLowerCase() === address.toLowerCase());
  }, [address, config]);

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
        setFailure(reason instanceof Error ? reason.message : "Governance action failed.");
      } finally {
        setBusy(null);
      }
    },
    [load, refresh],
  );

  const propose = () =>
    run("propose", async () => {
      const created = await createGovernancePayment(spaceId, {
        recipient: recipient.trim(),
        amount: amount.trim(),
        memo: memo.trim(),
        deadline: new Date(Date.now() + day).toISOString(),
      });
      setTypedData((current) => ({ ...current, [created.request.requestId]: created.typedData }));
      setRecipient("");
      setAmount("");
      setMemo("");
      return `Request ${created.request.requestId} queued. It needs ${config?.threshold ?? 2} approvals before it can execute.`;
    });

  const sign = (request: GovernanceRequest) =>
    run(`sign-${request.requestId}`, async () => {
      const data = typedData[request.requestId];
      if (!data) {
        throw new Error(
          "The EIP-712 payload for this request expired. Re-create the request to sign it again.",
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
      const signed = await signGovernanceRequest(spaceId, request.requestId, signature);
      return `Approval recorded from ${short(signed.approvals[signed.approvals.length - 1]?.signerAddress ?? "")}. ${signed.approvals.length}/${config?.threshold ?? 2} collected.`;
    });

  const execute = (request: GovernanceRequest) =>
    run(`execute-${request.requestId}`, async () => {
      const result = await executeGovernanceRequest(spaceId, request.requestId);
      return `Executed. Status ${result.status}${result.receipt?.txHash ? ` · tx ${result.receipt.txHash.slice(0, 10)}…` : ""}.`;
    });

  const saveConfig = () =>
    run("config", async () => {
      const signers = allowlist
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const next = await configureGovernance(spaceId, {
        threshold: Number(threshold),
        signerAllowlist: signers,
      });
      return `Governance set to ${next.threshold}-of-${next.signerAllowlist.length} across ${next.signerAllowlist.length} allowlisted signers.`;
    });

  if (!spaceId) {
    return <div className="app-state">Create or select a Space to configure governance.</div>;
  }

  const pending = requests.filter((item) => item.status === "PENDING");
  const settled = requests.filter((item) => item.status !== "PENDING");
  const executed = requests.filter((item) => item.status === "EXECUTED");
  const quorum = config?.threshold ?? 2;
  const signerCount = config?.signerAllowlist.length ?? 0;

  /** A signature is only possible from an allowlisted signer who has not
   *  already signed, and only for a request whose payload is in this session.
   *  Everything else is state, never a live control. */
  const canSign = (request: GovernanceRequest) => {
    if (!isAuthenticated || !signer) return false;
    const alreadySigned = request.approvals.some(
      (entry) => entry.signerAddress.toLowerCase() === (address ?? "").toLowerCase(),
    );
    return !alreadySigned && Boolean(typedData[request.requestId]);
  };

  const isReady = (request: GovernanceRequest) => request.approvals.length >= quorum;

  /** Requests this browser session raised, so their payload is on hand. */
  const sessionRequests = Object.keys(typedData)
    .map((id) => requests.find((item) => item.requestId === id))
    .filter((item): item is GovernanceRequest => Boolean(item));

  return (
    <div className="app-view gov-view">
      <header className="app-view__header">
        <div>
          <span className="eyebrow">Governance</span>
          <h1 className="display balance">Rules move by signature.</h1>
          <p>
            A Space payment leaves the ledger only after {quorum} of {signerCount} allowlisted
            signers approve the same EIP-712 digest — one fingerprint of this exact payment, so
            nobody can change the amount after it has been signed.
          </p>
        </div>
        <StatusPill
          label={
            config?.enabled === false
              ? "GOVERNANCE OFF"
              : pending.length
                ? `${pending.length} PENDING`
                : "QUEUE CLEAR"
          }
          tone={config?.enabled === false ? "danger" : pending.length ? "active" : "quiet"}
        />
      </header>

      {failure ? (
        <div className="action-flash action-flash--danger" role="status">
          {failure}
        </div>
      ) : null}

      {!isAuthenticated ? (
        <div className="action-flash" role="status">
          Governance is session-bound. Connect a wallet and sign the session to see this
          Space&rsquo;s quorum, its approval queue, and to cast a vote.
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
            <span className="stat-card__label">Requests</span>
            <span className="stat-card__value tnum">{requests.length}</span>
            <span className="stat-card__note">raised in this Space</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">≡</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Awaiting signatures</span>
            <span className="stat-card__value tnum">{pending.length}</span>
            <span className="stat-card__note">
              {pending.length ? "queued, no money moved" : "the queue is clear"}
            </span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">✎</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Executed</span>
            <span className="stat-card__value tnum">{executed.length}</span>
            <span className="stat-card__note">paid out to a recipient</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">✓</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Quorum</span>
            <span className="stat-card__value tnum">
              {quorum}-of-{signerCount}
            </span>
            <span className="stat-card__note">signatures to release money</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">◑</span>
          </span>
        </div>
      </div>

      <div className="gov-grid">
        {/* ── the rule, and who may sign it ── */}
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">QUORUM</h2>
            <span className="gov-panel__meta truncate">
              {space?.network} · chain {space?.chainId}
            </span>
          </div>
          <div className="panel__body">
            {config ? (
              <>
                <div className="gov-readout">
                  <span className="gov-readout__figure">
                    {quorum}-of-{signerCount}
                  </span>
                  <span className="gov-readout__note">
                    signatures required before a queued payment can leave the Space.
                  </span>
                </div>

                <div className="gov-signers">
                  {config.signerAllowlist.map((entry) => {
                    const approved = requests.some(
                      (item) =>
                        item.status === "PENDING" &&
                        item.approvals.some(
                          (approval) =>
                            approval.signerAddress.toLowerCase() === entry.toLowerCase(),
                        ),
                    );
                    return (
                      <div className="gov-signer" key={entry}>
                        <span className="gov-signer__address truncate">{entry}</span>
                        <StatusPill
                          label={approved ? "APPROVED" : "ELIGIBLE"}
                          tone={approved ? "active" : "quiet"}
                        />
                      </div>
                    );
                  })}
                </div>

                <p className="gov-note gov-note--tight">
                  A signature is a fingerprint of one exact payment — recipient, amount, memo and
                  deadline together. Change any of them and the fingerprint changes, so an approval
                  can never be moved onto a different or a larger payment.
                </p>

                {isAuthenticated ? (
                  <div className="gov-form gov-block">
                    <label className="gov-field">
                      <span className="gov-field__label">THRESHOLD</span>
                      <input
                        value={threshold}
                        inputMode="numeric"
                        onChange={(event) => setThreshold(event.target.value)}
                      />
                    </label>
                    <label className="gov-field">
                      <span className="gov-field__label">SIGNER ALLOWLIST</span>
                      <input
                        value={allowlist}
                        onChange={(event) => setAllowlist(event.target.value)}
                        placeholder="0xabc…, 0xdef…"
                      />
                    </label>
                    <span className="gov-field__hint">
                      Comma separated. Only these addresses can approve a payment.
                    </span>
                    <div className="gov-actions">
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => void saveConfig()}
                        disabled={busy === "config"}
                      >
                        {busy === "config" ? "SAVING…" : "Save quorum"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="gov-note">
                {loading
                  ? "Loading quorum…"
                  : failure
                    ? "Governance is not configured for this Space."
                    : "No governance configured."}
              </p>
            )}
          </div>
        </section>

        {/* ── raise a payment and put it in the queue ── */}
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">NEW REQUEST</h2>
            <span className="gov-panel__meta truncate">non-cap payments only</span>
          </div>
          <div className="panel__body">
            {isAuthenticated ? (
              <>
                <div className="gov-readout">
                  <span className="gov-readout__figure">{signer ? "SIGNER" : "REQUESTER"}</span>
                  <span className="gov-readout__note">
                    {signer
                      ? "your address is on the allowlist, so you can approve as well as raise"
                      : "you can raise a request; approving it needs an allowlisted signer"}
                  </span>
                </div>

                <div className="gov-form gov-block">
                  <label className="gov-field">
                    <span className="gov-field__label">PAY TO</span>
                    <input
                      value={recipient}
                      onChange={(event) => setRecipient(event.target.value)}
                      placeholder="0x…"
                    />
                  </label>
                  <label className="gov-field">
                    <span className="gov-field__label">AMOUNT</span>
                    <input
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="250.00"
                    />
                  </label>
                  <label className="gov-field">
                    <span className="gov-field__label">MEMO</span>
                    <input
                      value={memo}
                      onChange={(event) => setMemo(event.target.value)}
                      placeholder="why this leaves the Space"
                    />
                  </label>
                  <div className="gov-actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => void propose()}
                      disabled={busy === "propose" || !recipient.trim() || !amount.trim()}
                    >
                      {busy === "propose" ? "QUEUEING…" : "Queue for approval"}
                    </button>
                  </div>
                </div>

                {sessionRequests.length ? (
                  <div className="gov-block">
                    <p className="gov-note">
                      Raised from this browser, so these are the ones you can sign. A signature is
                      always over the exact terms shown in the queue below.
                    </p>
                    <div className="gov-signers gov-block gov-block--tight">
                      {sessionRequests.map((item) => (
                        <div className="gov-signer" key={`session-${item.requestId}`}>
                          <span className="gov-signer__address truncate">
                            {usd(item.amount)} to {short(item.recipient)}
                          </span>
                          {canSign(item) ? (
                            <button
                              type="button"
                              className="btn btn--primary"
                              onClick={() => void sign(item)}
                              disabled={busy === `sign-${item.requestId}`}
                            >
                              {busy === `sign-${item.requestId}` ? "SIGNING…" : "Sign approval"}
                            </button>
                          ) : (
                            <StatusPill label={item.status} tone="quiet" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="gov-note">Connect and sign a session to propose or approve a payment.</p>
            )}
          </div>
        </section>

        {/* ── what is waiting ── */}
        <section className="panel gov-grid__full">
          <div className="panel__head">
            <h2 className="panel__title">APPROVAL QUEUE</h2>
            <span className="gov-panel__meta tnum truncate">{requests.length} total</span>
          </div>
          <div className="panel__body">
            {requests.length === 0 ? (
              <div className="gov-empty">
                <span className="gov-empty__title">Nothing is waiting for a signature</span>
                <span>
                  Raise a request above and it appears here until enough allowlisted signers have
                  approved the same terms.
                </span>
              </div>
            ) : (
              <div className="gov-items">
                {requests.map((item) => {
                  const approvals = item.approvals.length;
                  const ready = isReady(item);
                  const outstanding = Math.max(quorum - approvals, 0);
                  return (
                    <article className="gov-item" key={item.requestId}>
                      <div className="gov-item__head">
                        <div className="gov-item__title">
                          <span className="gov-item__id truncate">{item.requestId}</span>
                          <span className="gov-item__figure tnum">
                            {usd(item.amount)}
                            <span className="gov-item__figure-unit truncate">{item.asset}</span>
                          </span>
                        </div>
                        <div className="gov-item__pills">
                          <StatusPill
                            label={item.status}
                            tone={
                              item.status === "EXECUTED"
                                ? "active"
                                : item.status === "PENDING"
                                  ? ready
                                    ? "active"
                                    : "quiet"
                                  : "quiet"
                            }
                          />
                        </div>
                      </div>

                      <div className="gov-item__meta">
                        <span className="truncate">to {item.recipient}</span>
                        <span className="truncate">by {item.requesterAddress}</span>
                        <span className="truncate">
                          expires {new Date(item.deadline).toLocaleString("en-US")}
                        </span>
                      </div>

                      {item.memo ? <p className="gov-item__memo clamp-2">{item.memo}</p> : null}

                      <div className="gov-item__foot">
                        <QuorumMeter approvals={approvals} threshold={quorum} />

                        <div className="gov-hash">
                          <span className="gov-hash__label">EIP-712 DIGEST</span>
                          <span className="gov-hash__value ident">{item.digest}</span>
                        </div>

                        <div className="gov-item__actions">
                          {item.status === "PENDING" && !ready ? (
                            <span className="gov-item__waiting">
                              waiting on {outstanding} more signature{outstanding === 1 ? "" : "s"}
                            </span>
                          ) : null}
                          {canSign(item) ? (
                            <button
                              type="button"
                              className="btn btn--primary"
                              onClick={() => void sign(item)}
                              disabled={busy === `sign-${item.requestId}`}
                            >
                              {busy === `sign-${item.requestId}` ? "SIGNING…" : "Sign approval"}
                            </button>
                          ) : null}
                          {item.status === "PENDING" && ready ? (
                            <button
                              type="button"
                              className="btn btn--primary"
                              onClick={() => void execute(item)}
                              disabled={busy === `execute-${item.requestId}`}
                            >
                              {busy === `execute-${item.requestId}`
                                ? "EXECUTING…"
                                : "Execute payment"}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {item.receipt?.txHash ? (
                        <div className="gov-hash">
                          <span className="gov-hash__label">SETTLED ONCHAIN</span>
                          <span className="gov-hash__value ident">{item.receipt.txHash}</span>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}

            <p className="gov-note gov-note--tight">
              {requests.length === 0
                ? "When a request is waiting, its digest is here: one fingerprint of the recipient, amount, memo and deadline, and the exact thing every signer signs."
                : `The digest on each request is what every signer signs: one fingerprint of the recipient, amount, memo and deadline. ${
                    settled.length > 0
                      ? `${settled.length} settled or refused request${settled.length === 1 ? " is" : "s are"} retained here for audit.`
                      : "Settled and refused requests are retained here for audit."
                  }`}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSignTypedData } from "wagmi";

import { StatusPill } from "@/components/app/StatusPill";
import { useAppData } from "@/lib/app-data";
import { useWalletSession } from "@/lib/wallet-session";
import {
  createDelegation,
  fetchDelegations,
  revokeDelegation,
  signDelegation,
  verifyDelegation,
  type AuthorityDelegation,
  type Eip712TypedData,
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

/** A delegation id has to be unique and is not derived from anything the
 *  client can see, so it is minted here: a nonce, then six hex bytes. */
const hex = (bytes: number) =>
  `0x${Array.from({ length: bytes }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;

/** The three limits an envelope can hold. An envelope is nothing but these,
 *  which is why "narrower" is a comparison between two of them. */
type Limits = {
  cap: string;
  budget: string;
  counterparties: string[];
};

/* ── the containment, drawn ────────────────────────────────────────────────
   The child envelope is an inset panel inside the parent's, the same
   relationship the split stat card has with its own inset (DESIGN.md §4), and
   every child figure carries the parent figure it is measured against. Below
   768px the two stack and the inset becomes a full-width block. */

function LimitRows({ limits, against }: { limits: Limits; against?: Limits }) {
  const named = limits.counterparties.length;
  const parentNamed = against?.counterparties.length ?? 0;
  const counterparties = named ? `${named} named` : against ? "inherits parent" : "any";

  return (
    <>
      <div className="gov-row">
        <span className="gov-row__label">
          Per transaction
          {against ? <span className="gov-row__of truncate">of {usd(against.cap)} parent</span> : null}
        </span>
        <span className="gov-row__value">{usd(limits.cap)}</span>
      </div>

      <div className="gov-row">
        <span className="gov-row__label">
          Daily budget
          {against ? <span className="gov-row__of truncate">of {usd(against.budget)} parent</span> : null}
        </span>
        <span className="gov-row__value">{usd(limits.budget)}</span>
      </div>

      <div className="gov-row">
        <span className="gov-row__label">
          Counterparties
          {against ? (
            <span className="gov-row__of truncate">
              {named
                ? `${named} of ${parentNamed} the parent names`
                : "inherits the parent's full set"}
            </span>
          ) : null}
        </span>
        <span className="gov-row__value">{counterparties}</span>
      </div>
    </>
  );
}

function EnvelopeNest({
  parent,
  child,
  note,
}: {
  parent: Limits;
  child: Limits | null;
  note: string;
}) {
  return (
    <div className="deleg-nest">
      <div className="deleg-nest__limits">
        <span className="deleg-env__label">PARENT AUTHORITY</span>
        <LimitRows limits={parent} />
      </div>

      <div className="deleg-nest__child">
        <span className="deleg-env__label">
          <span className="deleg-env__arrow" aria-hidden="true">
            →
          </span>
          CHILD ENVELOPE
        </span>
        {child ? (
          <LimitRows limits={child} against={parent} />
        ) : (
          <p className="deleg-env__empty">
            Nothing nested here yet. Create an envelope and it appears inside these limits, never
            beside them.
          </p>
        )}
      </div>

      <p className="deleg-nest__note">{note}</p>
    </div>
  );
}

/* ── the view ────────────────────────────────────────────────────────────── */

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

  useEffect(() => {
    void load();
  }, [load]);

  /** The Space's own limits: the parent every envelope is measured against. */
  const parent: Limits = {
    cap: bounds?.maxPerTransaction ?? space?.rules.maxPerTransaction ?? "0",
    budget: bounds?.dailyBudget ?? space?.rules.dailyBudget ?? "0",
    counterparties: space?.rules.allowedCounterparties ?? [],
  };

  // mirrors the server's subset proof so escalation is visible before submitting
  const escalation = useMemo(() => {
    const reasons: string[] = [];
    if (cap && Number(cap) > Number(parent.cap)) {
      reasons.push(`cap ${usd(cap)} exceeds parent cap ${usd(parent.cap)}`);
    }
    if (budget && Number(budget) > Number(parent.budget)) {
      reasons.push(`daily budget ${usd(budget)} exceeds parent budget ${usd(parent.budget)}`);
    }
    const parentSet = new Set(parent.counterparties.map((entry) => entry.toLowerCase()));
    const requested = counterparties
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    if (parentSet.size && requested.some((entry) => !parentSet.has(entry))) {
      reasons.push("a requested counterparty is outside the parent allowlist");
    }
    return reasons;
  }, [cap, budget, counterparties, parent]);

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
        setFailure(reason instanceof Error ? reason.message : "Delegation action failed.");
      } finally {
        setBusy(null);
      }
    },
    [load, refresh],
  );

  const issue = () =>
    run("issue", async () => {
      const now = Math.floor(Date.now() / 1000);
      const created = await createDelegation(spaceId, {
        delegationId: `delegation-${hex(6)}`,
        child: child.trim(),
        childRole,
        maxPerTransaction: cap.trim(),
        dailyBudget: budget.trim(),
        allowedCounterparties: counterparties
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
        nonce: String(now),
        expiry: String(now + Number(validity || "3600")),
        policySnapshotHash: `0x${"0".repeat(64)}`,
      });
      setPayloads((current) => ({
        ...current,
        [created.delegation.delegationId]: created.typedData,
      }));
      setChild("");
      setCap("");
      setBudget("");
      setCounterparties("");
      return `Envelope ${created.delegation.delegationId} created. Subset proof ${created.proof.valid ? "passed" : "failed"}, so it can only narrow. Sign it to activate.`;
    });

  const sign = (item: AuthorityDelegation) =>
    run(`sign-${item.delegationId}`, async () => {
      const data = payloads[item.delegationId] ?? item.typedData;
      if (!data) {
        throw new Error(
          "The EIP-712 payload for this envelope is no longer available. Create a new delegation to sign it.",
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
      const signed = await signDelegation(spaceId, item.delegationId, signature, item.digest);
      return `Signed by ${short(signed.signedBy ?? "")}. The child may now act only inside this envelope.`;
    });

  const verify = (item: AuthorityDelegation) =>
    run(`verify-${item.delegationId}`, async () => {
      const result = await verifyDelegation(spaceId, item.delegationId);
      return `Verification passed. Signer ${short(result.signer)}, digest ${result.digest.slice(0, 10)}…, status ${result.status}.`;
    });

  const revoke = (item: AuthorityDelegation) =>
    run(`revoke-${item.delegationId}`, async () => {
      const revoked = await revokeDelegation(spaceId, item.delegationId);
      return `Revoked by ${short(revoked.revokedBy ?? "")}. The child can no longer act under this envelope.`;
    });

  if (!spaceId) {
    return <div className="app-state">Create or select a Space to delegate authority.</div>;
  }

  const active = delegations.filter((item) => item.status === "SIGNED");
  const inactive = delegations.filter((item) => item.status !== "SIGNED");

  /** A child is narrowed when it holds strictly less than the parent on
   *  either money limit. Counterparties are a set, so an equal-length
   *  different set is a narrowing too — but not one a figure can show. */
  const narrowed = active.filter(
    (item) =>
      Number(item.maxPerTransaction) < Number(parent.cap) ||
      Number(item.dailyBudget) < Number(parent.budget),
  ).length;

  const limitsOf = (item: AuthorityDelegation): Limits => ({
    cap: item.maxPerTransaction,
    budget: item.dailyBudget,
    counterparties: item.allowedCounterparties,
  });

  /** The one envelope shown nested in the parent panel: the first active one,
   *  or otherwise the first one raised, so the containment is drawn even
   *  while nothing is signed yet. */
  const nested = active[0] ?? delegations[0] ?? null;

  return (
    <div className="app-view gov-view">
      <header className="app-view__header">
        <div>
          <span className="eyebrow">Delegation</span>
          <h1 className="display balance">Authority narrows. It never grows.</h1>
          <p>
            A signed envelope can only reduce a child actor&rsquo;s cap, budget, and
            counterparties. Expansion is rejected by a subset proof, not by review.
          </p>
        </div>
        <StatusPill
          label={active.length ? `${active.length} ACTIVE` : "NO ACTIVE ENVELOPES"}
          tone={active.length ? "active" : "quiet"}
        />
      </header>

      {failure ? (
        <div className="action-flash action-flash--danger" role="status">
          {failure}
        </div>
      ) : null}

      {!isAuthenticated ? (
        <div className="action-flash" role="status">
          Delegations are session-bound. Connect a wallet and sign the session to see this
          Space&rsquo;s envelopes and to sign, verify, or revoke one.
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
            <span className="stat-card__label">Active envelopes</span>
            <span className="stat-card__value tnum">{active.length}</span>
            <span className="stat-card__note">signed and usable</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">◧</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Narrowed</span>
            <span className="stat-card__value tnum">{narrowed}</span>
            <span className="stat-card__note">narrower than the Space</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">⊂</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Unsigned or revoked</span>
            <span className="stat-card__value tnum">{inactive.length}</span>
            <span className="stat-card__note">no child may act</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">⊘</span>
          </span>
        </div>
      </div>

      <div className="gov-grid">
        {/* ── the parent, and one child inside it ── */}
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">PARENT ENVELOPE</h2>
            <span className="gov-panel__meta truncate">{space?.name ?? "this Space"}</span>
          </div>
          <div className="panel__body">
            <EnvelopeNest
              parent={parent}
              child={nested ? limitsOf(nested) : null}
              note={
                nested
                  ? nested.status === "SIGNED"
                    ? `The Space is the widest authority there is. The nested envelope is the most the ${nested.childRole} named above may do.`
                    : `The Space is the widest authority there is. The nested envelope is not signed yet, so the ${nested.childRole} cannot act under it at all.`
                  : "An envelope is a set of limits. Signed, it is the most a child actor may do — and never more than the Space already allows."
              }
            />

            <p className="gov-note gov-note--tight">
              Every envelope below must sit inside this one. The server recomputes the subset proof
              on create and refuses anything larger, so an attempt to widen authority is not
              something a reviewer has to catch.
            </p>
          </div>
        </section>

        {/* ── hand out something narrower ── */}
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">ISSUE A NARROWER ENVELOPE</h2>
            <span className="gov-panel__meta truncate">EIP-712 · signed by the parent</span>
          </div>
          <div className="panel__body">
            {isAuthenticated ? (
              <div className="gov-form">
                <label className="gov-field">
                  <span className="gov-field__label">CHILD ADDRESS</span>
                  <input value={child} onChange={(event) => setChild(event.target.value)} placeholder="0x…" />
                </label>

                <label className="gov-field">
                  <span className="gov-field__label">CHILD ROLE</span>
                  <select value={childRole} onChange={(event) => setChildRole(event.target.value)}>
                    <option value="agent">Agent</option>
                    <option value="operator">Operator</option>
                  </select>
                </label>

                <label className="gov-field">
                  <span className="gov-field__label">MAX PER TRANSACTION</span>
                  <input
                    value={cap}
                    onChange={(event) => setCap(event.target.value)}
                    inputMode="decimal"
                    placeholder={parent.cap}
                  />
                </label>

                <label className="gov-field">
                  <span className="gov-field__label">DAILY BUDGET</span>
                  <input
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                    inputMode="decimal"
                    placeholder={parent.budget}
                  />
                </label>

                <label className="gov-field">
                  <span className="gov-field__label">COUNTERPARTIES</span>
                  <input
                    value={counterparties}
                    onChange={(event) => setCounterparties(event.target.value)}
                    placeholder="blank inherits the parent set"
                  />
                </label>

                <label className="gov-field">
                  <span className="gov-field__label">VALID FOR (SECONDS)</span>
                  <input
                    value={validity}
                    onChange={(event) => setValidity(event.target.value)}
                    inputMode="numeric"
                  />
                </label>

                <span className="gov-field__hint">
                  An empty counterparty list inherits every counterparty the Space allows, which is
                  the widest the child can be — never wider.
                </span>

                {escalation.length > 0 ? (
                  <div className="gov-alert" role="status">
                    <span className="gov-alert__label">ESCALATION BLOCKED</span>
                    <span>{escalation.join(" · ")}</span>
                  </div>
                ) : null}

                <div className="gov-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => void issue()}
                    disabled={
                      busy === "issue" ||
                      escalation.length > 0 ||
                      !child.trim() ||
                      !cap.trim() ||
                      !budget.trim()
                    }
                  >
                    {busy === "issue" ? "ISSUING…" : "Create envelope"}
                  </button>
                </div>
              </div>
            ) : (
              <p className="gov-note">
                Connect and sign a session as an admin, agent, or operator to issue an envelope.
              </p>
            )}
          </div>
        </section>

        {/* ── every envelope this Space has handed out ── */}
        <section className="panel gov-grid__full">
          <div className="panel__head">
            <h2 className="panel__title">ENVELOPES</h2>
            <span className="gov-panel__meta tnum truncate">{delegations.length} total</span>
          </div>
          <div className="panel__body">
            {delegations.length === 0 ? (
              <div className="gov-empty">
                <span className="gov-empty__title">No delegation envelopes in this Space yet</span>
                <span>
                  {loading
                    ? "Loading envelopes…"
                    : "One envelope hands a named child a smaller cap, a smaller budget, or a shorter counterparty list."}
                </span>
              </div>
            ) : (
              <div className="gov-items">
                {[...active, ...inactive].map((item) => {
                  const mine = Boolean(
                    isAuthenticated && address && item.parentActor.toLowerCase() === address.toLowerCase(),
                  );
                  const isNarrowed =
                    Number(item.maxPerTransaction) < Number(parent.cap) ||
                    Number(item.dailyBudget) < Number(parent.budget);

                  return (
                    <article className="gov-item" key={item.delegationId}>
                      <div className="gov-item__head">
                        <div className="gov-item__title">
                          <span className="gov-item__id truncate">{item.delegationId}</span>
                          <span className="gov-item__name truncate">
                            {short(item.parentActor)} hands {item.childRole} {short(item.child)}
                          </span>
                        </div>
                        <div className="gov-item__pills">
                          <StatusPill
                            label={isNarrowed ? "NARROWED" : "MATCHES PARENT"}
                            tone={isNarrowed ? "active" : "quiet"}
                          />
                          <StatusPill
                            label={item.status}
                            tone={
                              item.status === "SIGNED"
                                ? "active"
                                : item.status === "REVOKED" || item.status === "EXPIRED"
                                  ? "danger"
                                  : "quiet"
                            }
                          />
                        </div>
                      </div>

                      <EnvelopeNest
                        parent={parent}
                        child={limitsOf(item)}
                        note="A signed envelope is the child's whole authority. It cannot be widened after signing, and revoking it withdraws all of it at once."
                      />

                      <div className="gov-item__meta">
                        <span className="truncate">asset {item.asset}</span>
                        <span className="truncate">chain {item.chainId}</span>
                        <span className="truncate">
                          expires {new Date(item.expiryAt).toLocaleString("en-US")}
                        </span>
                        {item.signedAt ? (
                          <span className="truncate">
                            signed {new Date(item.signedAt).toLocaleString("en-US")}
                          </span>
                        ) : null}
                      </div>

                      <div className="gov-item__foot">
                        <div className="gov-hash">
                          <span className="gov-hash__label">EIP-712 DIGEST</span>
                          <span className="gov-hash__value ident">{item.digest}</span>
                        </div>

                        <div className="gov-item__actions">
                          {item.status === "PENDING" && mine ? (
                            <button
                              type="button"
                              className="btn btn--primary"
                              onClick={() => void sign(item)}
                              disabled={busy === `sign-${item.delegationId}`}
                            >
                              {busy === `sign-${item.delegationId}` ? "SIGNING…" : "Sign envelope"}
                            </button>
                          ) : null}
                          {item.status === "SIGNED" ? (
                            <button
                              type="button"
                              className="btn btn--secondary"
                              onClick={() => void verify(item)}
                              disabled={busy === `verify-${item.delegationId}`}
                            >
                              {busy === `verify-${item.delegationId}` ? "VERIFYING…" : "Verify"}
                            </button>
                          ) : null}
                          {(item.status === "PENDING" || item.status === "SIGNED") && mine ? (
                            <button
                              type="button"
                              className="btn btn--danger"
                              onClick={() => void revoke(item)}
                              disabled={busy === `revoke-${item.delegationId}`}
                            >
                              {busy === `revoke-${item.delegationId}` ? "REVOKING…" : "Revoke"}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <p className="gov-note">
                        The digest is one fingerprint of this exact set of limits. Widen a single
                        limit and the fingerprint changes, so a signature can never be replayed onto
                        a roomier envelope.
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AuditStream } from "@/components/app/AuditStream";
import { useAppData } from "@/lib/app-data";
import { fetchIndexerStatus, fetchReconciliation, type IndexerStatus, type Job, type Reconciliation } from "@/lib/contract";

import "@/app/views-work.css";

const number = new Intl.NumberFormat("en-US");

/** The indexer endpoint reports its backfill as a `catchUp` block. It is not
 *  in the shared IndexerStatus type and lib/contract.ts is not this view's
 *  file, so the field is read through a local widening rather than by editing
 *  someone else's contract. */
type IndexerHealth = IndexerStatus & {
  catchUp?: {
    active?: boolean;
    complete?: boolean;
    fromBlock?: number;
    targetBlock?: number;
    windowBlocks?: number;
    windowsDone?: number;
  };
};

type Tone = "quiet" | "active" | "danger";

/* ── what the pill is allowed to say ────────────────────────────────────────
   The false alarm this panel used to raise: the tail loop re-syncs the last
   few blocks every few seconds, so a sample taken mid-pass reads
   RECONCILING — and RECONCILING was drawn as a danger. A healthy system was
   rendering as a red warning, which is worse than useless: it trains the
   reader to ignore red.

   Three rules replace it.

   1. Danger is reserved for an actual error. A pass in flight is not an
      error, so RECONCILING is a quiet, informational state.
   2. A finished catch-up with no error reads as settled. The pill reports
      RECONCILED, because that is the state the indexer is in, and the word
      the tail loop's transient value used to overwrite is the one the test
      contract reads.
   3. Whatever the pill says, the sentence under it states the real position
      in full, so the panel never depends on a single word to be honest. */

function readPill(state: IndexerHealth): { label: string; tone: Tone } {
  const raw = state.reconciliation?.status ?? state.status ?? "UNKNOWN";
  const failed = Boolean(state.reconciliation?.error ?? state.error);

  if (failed) return { label: raw, tone: "danger" };
  if (state.catchUp?.complete === true || raw === "RECONCILED") return { label: "RECONCILED", tone: "active" };
  if (raw === "RECONCILING") return { label: "RECONCILING", tone: "quiet" };
  return { label: raw, tone: "quiet" };
}

/** The same position, in a sentence. */
function readNote(state: IndexerHealth, label: string): string {
  const catchUp = state.catchUp;
  const cursor = state.cursor?.blockNumber;
  const from = catchUp?.fromBlock ?? state.fromBlock;
  const target = catchUp?.targetBlock;

  const parts: string[] = [];

  if (catchUp?.complete) {
    parts.push(
      `Backfill complete: ${number.format(catchUp.windowsDone ?? 0)} window${
        catchUp.windowsDone === 1 ? "" : "s"
      } of ${number.format(catchUp.windowBlocks ?? 0)} blocks from ${number.format(from ?? 0)}`,
    );
  } else if (label === "RECONCILING") {
    parts.push(`Backfill in progress from ${number.format(from ?? 0)}`);
  }

  if (cursor !== undefined) {
    parts.push(`cursor at block ${number.format(cursor)}`);
    if (target !== undefined && target > cursor) {
      parts.push(`${number.format(target - cursor)} blocks behind the ${number.format(target)} this Space indexed to`);
    }
  }

  if (state.reorgDepth !== undefined) {
    parts.push(`re-reads the last ${state.reorgDepth} blocks on a timer`);
  }

  if (!state.reconciliation?.error && !state.error) {
    parts.push("no error is recorded");
  }

  return `${parts.join("; ")}.`;
}

/* ── the panel ────────────────────────────────────────────────────────────── */

/**
 * What our books claim against what the chain is holding.
 *
 * This exists because the balances the product quotes are, today, funded by the
 * broadcaster's wallet rather than by a per-Space onchain pool. The report says
 * so plainly instead of leaving it to be found during an incident — and it is
 * the gate on making payments draw from a Space's own funds.
 */
function ReconciliationPanel({ state }: { state: Reconciliation | null }) {
  if (!state) return null;
  const { summary } = state;
  const verdict = !state.poolDeployed
    ? { label: "THIS ROUTER HAS NO PER-SPACE POOL", tone: "bad" }
    : !state.chainBalances
    ? { label: "THE ROUTER\u2019S BOOKS DO NOT ADD UP", tone: "bad" }
    : state.agrees
      ? { label: "THE CHAIN MATCHES OUR BOOKS", tone: "good" }
      : { label: "OUR BOOKS ARE NOT BACKED BY THE CHAIN", tone: "warn" };

  return (
    <section className={`recon recon--${verdict.tone}`} aria-label="Balance reconciliation">
      <header>
        <h3>Do the chain and our books agree?</h3>
        <span className="recon__verdict">{verdict.label}</span>
      </header>

      {!state.poolDeployed ? (
        <p className="muted">
          The settlement router this deployment points at was built before per-Space pools existed,
          so it cannot hold a Space\u2019s funds at all. Every balance below is still sitting in the
          broadcaster wallet, and this check cannot pass until the router is redeployed.
        </p>
      ) : !state.chainBalances ? (
        <p className="muted">
          The settlement router holds less than it says it owes Spaces. That is a problem with a
          contract, not with this page, and nothing should draw funds from a pool until it is fixed.
        </p>
      ) : state.agrees ? (
        <p className="muted">
          Every Space below has exactly as much held on chain as our books claim. Payments can be
          funded from the Space\u2019s own pool.
        </p>
      ) : (
        <p className="muted">
          Our books say Spaces hold {summary.claimTotal} USDC. The settlement router is holding{" "}
          {summary.routerTokenBalance} USDC in total, and owes {summary.totalAccounted} of it to
          Spaces. Until those two numbers meet, a balance here is our claim rather than a fact —
          the money has been held in one shared wallet, not per Space.
        </p>
      )}

      <table className="recon__table">
        <thead>
          <tr><th>Space</th><th>Our books claim</th><th>Chain holds for it</th><th>Difference</th><th>State</th></tr>
        </thead>
        <tbody>
          {state.perSpace.map((row) => (
            <tr key={row.spaceId}>
              <td className="ident">{row.spaceId}</td>
              <td className="tnum">{row.claimed}</td>
              <td className="tnum">{row.heldOnChain}</td>
              <td className="tnum">{row.difference}</td>
              <td>{row.state}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="muted recon__foot">
        Checked {new Date(state.checkedAt).toLocaleString()}
        {" · "}this checks the chain holds what we claim, not that the tokens were earned rather
        than minted — an ERC-20 transfer cannot tell those apart
        {Number(summary.excess) > 0 ? ` · ${summary.excess} USDC was sent to the router by mistake and is sweepable` : ""}
        {" · "}funding from the pool is {state.readyToFundFromPool ? "unblocked" : "blocked until the books agree"}.
      </p>
    </section>
  );
}

function IndexerPanel({ state }: { state: IndexerHealth | null }) {
  const { jobs } = useAppData();

  /* The projection's own job ids are the same ids the work endpoint returns,
     so the description a human wrote is already in memory. Looking it up is
     the difference between "Cloud compute allocation" and
     "onchain-1952-cdddcdc4-1" as the first line of a row. */
  const descriptions = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const job of jobs as Array<Job & { onchainJobId?: string }>) {
      const title = job.description?.trim();
      if (!title) continue;
      lookup.set(job.jobId, title);
      if (job.onchainJobId) lookup.set(`onchain:${job.onchainJobId}`, title);
    }
    return lookup;
  }, [jobs]);

  const titleFor = (jobId: string, onchainJobId: string | null) =>
    descriptions.get(jobId) ??
    (onchainJobId ? descriptions.get(`onchain:${onchainJobId}`) : undefined) ??
    (onchainJobId ? `Onchain job #${onchainJobId}` : "Unnamed projection");

  if (!state) {
    return (
      <section className="panel indexer-panel">
        <div className="panel__head">
          <h2 className="panel__title">CHAIN INDEXER</h2>
        </div>
        <div className="panel__body">
          <p className="indexer-note indexer-note--last">Reading indexer status…</p>
        </div>
      </section>
    );
  }

  if (!state.enabled) {
    return (
      <section className="panel indexer-panel">
        <div className="panel__head">
          <h2 className="panel__title">CHAIN INDEXER</h2>
          <span className="status-pill status-pill--quiet">NOT CONFIGURED</span>
        </div>
        <div className="panel__body">
          <p className="indexer-note indexer-note--last">
            {state.reason ?? "No chain indexer is configured for this deployment."} The trail below is this
            Space&rsquo;s own sequenced activity log. Onchain projections appear here once a chain is wired.
          </p>
        </div>
      </section>
    );
  }

  const { label, tone } = readPill(state);
  const error = state.reconciliation?.error ?? state.error ?? null;
  const projected = state.projectedJobs ?? [];
  const shown = projected.slice(0, 6);

  return (
    <section className="panel indexer-panel">
      <div className="panel__head">
        <h2 className="panel__title">CHAIN INDEXER</h2>
        <span className={`status-pill status-pill--${tone}`}>{label}</span>
      </div>

      <div className="panel__body">
        <div className="indexer-readout">
          <div>
            <span className="indexer-readout__value">{number.format(state.projectionCount ?? 0)}</span>
            <span className="indexer-readout__label">onchain projections</span>
          </div>
          <div>
            <span className="indexer-readout__value">
              {number.format(state.cursor ? state.cursor.blockNumber : (state.fromBlock ?? 0))}
            </span>
            <span className="indexer-readout__label">
              {state.cursor ? "cursor block" : "starting block"}
            </span>
          </div>
          <div>
            <span className="indexer-readout__value">{state.transport ?? "—"}</span>
            <span className="indexer-readout__label">transport · chain {state.chainId ?? "—"}</span>
          </div>
        </div>

        <p className="indexer-note">{readNote(state, label)}</p>

        {error ? <p className="indexer-error">{error}</p> : null}

        {state.cursor ? (
          <div className="audit-hash">
            <span className="audit-hash__label">CURSOR TX</span>
            <span className="audit-hash__value">{state.cursor.txHash}</span>
            <CopyButton value={state.cursor.txHash} />
          </div>
        ) : null}

        {shown.length ? (
          <>
            <ul className="indexer-jobs">
              {shown.map((job) => (
                <li className="indexer-job" key={job.jobId}>
                  <span className="indexer-job__text">
                    <span className="indexer-job__title">{titleFor(job.jobId, job.onchainJobId)}</span>
                    <span className="indexer-job__id">{job.jobId}</span>
                  </span>
                  {/* Deliberately NOT .status-pill: the test contract reads
                      `.indexer-panel .status-pill` as the indexer's own state
                      (DESIGN.md §7), and a second one in the same panel makes
                      that locator ambiguous. This is the same quiet chip, built
                      locally under this file's own prefix. */}
                  <span className="indexer-job__status">{job.status}</span>
                </li>
              ))}
            </ul>
            <p className="indexer-foot">
              <span>
                {shown.length} of {number.format(projected.length)} projections
                {state.contractAddress ? ` · contract ${state.contractAddress}` : ""}
              </span>
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

/* The copy affordance HashChip used to bring, rebuilt locally: views-work.css
   owns `.audit-copy`, and a hash chip that expands a 66-character hash on a
   326px phone is an overflow, not a feature. */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="audit-copy"
      aria-label={copied ? "Cursor transaction copied" : "Copy cursor transaction hash"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

export function AuditView() {
  const { spaceId, activity } = useAppData();
  const [indexer, setIndexer] = useState<IndexerHealth | null>(null);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);

  const load = useCallback(async () => {
    if (!spaceId) return;
    try {
      setIndexer(await fetchIndexerStatus(spaceId));
    } catch {
      setIndexer({ enabled: false, reason: "Indexer status is unavailable." });
    }
    // The reconciliation needs a wallet session, so it fails quietly when there
    // is not one. Its absence must not be read as agreement.
    try {
      setReconciliation(await fetchReconciliation(spaceId));
    } catch {
      setReconciliation(null);
    }
  }, [spaceId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      void load();
    }, 20000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <div className="app-view">
      <header className="app-view__header">
        <div>
          <span className="eyebrow">Audit</span>
          <h1 className="display balance">Proof has a trail.</h1>
          <p>Activity stays paginated, sequenced, and live without hiding failures.</p>
        </div>
        <span className="status-pill view-figure">{activity.length} EVENTS LOADED</span>
      </header>

      <ReconciliationPanel state={reconciliation} />

      <IndexerPanel state={indexer} />
      <AuditStream />
    </div>
  );
}

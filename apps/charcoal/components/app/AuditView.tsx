"use client";

import { useCallback, useEffect, useState } from "react";
import { AuditStream } from "@/components/app/AuditStream";
import { CardRise } from "@/components/motion";
import { HashChip } from "@/components/HashChip";
import { StatusPill } from "@/components/app/StatusPill";
import { useAppData } from "@/lib/app-data";
import { fetchIndexerStatus, type IndexerStatus } from "@/lib/contract";

const number = new Intl.NumberFormat("en-US");

function IndexerPanel({ state }: { state: IndexerStatus | null }) {
  if (!state) return <CardRise className="command-panel indexer-panel"><div className="command-panel__head"><span className="eyebrow">CHAIN INDEXER</span></div><p className="muted" style={{ marginTop: 14 }}>Reading indexer status…</p></CardRise>;
  if (!state.enabled) return <CardRise className="command-panel indexer-panel">
    <div className="command-panel__head"><span className="eyebrow">CHAIN INDEXER</span><StatusPill label="NOT CONFIGURED" tone="quiet" /></div>
    <p className="muted" style={{ marginTop: 14 }}>{state.reason ?? "No chain indexer is running for this deployment."}</p>
    <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>The trail below is this Space&rsquo;s own sequenced activity log. Onchain projections appear here once a chain is wired.</p>
  </CardRise>;
  const reconciled = state.reconciliation?.status === "RECONCILED";
  return <CardRise className="command-panel indexer-panel">
    <div className="command-panel__head">
      <span className="eyebrow">CHAIN INDEXER</span>
      <StatusPill label={state.reconciliation?.status ?? "UNKNOWN"} tone={reconciled ? "active" : "danger"} />
    </div>
    <div className="indexer-readout">
      <div><strong className="font-ui">{number.format(state.projectionCount ?? 0)}</strong><span>onchain projections</span></div>
      <div><strong className="font-ui">{state.cursor ? number.format(state.cursor.blockNumber) : number.format(state.fromBlock ?? 0)}</strong><span>{state.cursor ? "cursor block" : "starting block"}</span></div>
      <div><strong className="font-ui">{state.transport ?? "—"}</strong><span>transport &middot; chain {state.chainId}</span></div>
    </div>
    {state.reconciliation?.error && <p className="indexer-error">{state.reconciliation.error}</p>}
    {state.cursor && <div className="indexer-cursor"><HashChip hash={state.cursor.txHash} kind="transaction" label="CURSOR TX" /></div>}
    {(state.projectedJobs?.length ?? 0) > 0 && <ul className="indexer-jobs">
      {state.projectedJobs!.slice(0, 6).map((job) => <li key={job.jobId}><span className="font-ui">{job.onchainJobId ? `onchain job ${job.onchainJobId}` : job.jobId}</span><em>{job.status}</em></li>)}
    </ul>}
  </CardRise>;
}

export function AuditView() {
  const { spaceId, activity } = useAppData();
  const [indexer, setIndexer] = useState<IndexerStatus | null>(null);
  const load = useCallback(async () => {
    if (!spaceId) return;
    try { setIndexer(await fetchIndexerStatus(spaceId)); } catch { setIndexer({ enabled: false, reason: "Indexer status is unavailable." }); }
  }, [spaceId]);
  useEffect(() => { void load(); const timer = setInterval(() => { void load(); }, 20000); return () => clearInterval(timer); }, [load]);
  return <div className="app-view">
    <header className="app-view__header">
      <div><span className="eyebrow">AUDIT</span><h1 className="display">Proof has a trail.</h1><p>Activity stays paginated, sequenced, and live without hiding failures.</p></div>
      <StatusPill label={`${activity.length} EVENTS LOADED`} tone="active" />
    </header>
    <IndexerPanel state={indexer} />
    <AuditStream embedded />
  </div>;
}

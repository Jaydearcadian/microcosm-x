"use client";

import { useState } from "react";
import { CardRise } from "@/components/motion";
import { HashChip } from "@/components/HashChip";
import { StatusPill } from "@/components/app/StatusPill";
import { SectionIntro } from "@/components/app/SectionIntro";
import { evaluateJob, postVerdict, type Job, type JobStatus } from "@/lib/contract";
import { useAppData } from "@/lib/app-data";

const COLUMNS: Array<{ status: JobStatus; label: string; copy: string }> = [
  { status: "Funded", label: "FUNDED", copy: "escrowed" },
  { status: "Submitted", label: "SUBMITTED", copy: "proof in" },
  { status: "Completed", label: "COMPLETED", copy: "settled" },
  { status: "Rejected", label: "REJECTED", copy: "refunded" },
  { status: "Adjudicating", label: "ADJUDICATING", copy: "court ruling" },
];
const money = (v: string) => Number(v).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function WorkKanban({ embedded = false }: { embedded?: boolean } = {}) {
  const { spaceId, jobs, refresh, error } = useAppData();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const act = async (job: Job, approved: boolean) => { setBusy(job.jobId); setMessage(null); try { if (job.status === "Adjudicating") await postVerdict(spaceId, job.jobId, job.adjudicator ?? "court-01", approved, approved ? "Approved by court" : "Rejected by court"); else await evaluateJob(spaceId, job.jobId, job.evaluator ?? "admin-01", approved, approved ? "Approved by evaluator" : "Rejected by evaluator"); await refresh(); setMessage(approved ? "Settlement recorded." : "Gaia refund recorded."); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Action failed."); } finally { setBusy(null); } };
  return <section className={`app-section app-section--work ${embedded ? "app-section--embedded" : ""}`} id="work-board"><div className="container">{!embedded && <SectionIntro eyebrow="WORK KANBAN" segments={[{ text: "The work is the" }, { text: "source of truth", accent: true }, { text: "." }]} copy="Columns are the contract's job states. A payout cannot move out of Submitted without an evaluator action or a court verdict." />}{message && <div className="action-flash">{message}</div>}{error && <div className="action-flash action-flash--danger">{error}</div>}<div className="kanban-scroll"><div className="kanban-grid">{COLUMNS.map((column) => { const columnJobs = jobs.filter((job) => job.status === column.status); return <CardRise key={column.status} delay={COLUMNS.indexOf(column) * 0.1} className="kanban-column"><div className="kanban-column__head"><div><span className="eyebrow">{column.label}</span><span className="muted kanban-column__copy">{column.copy}</span></div><strong className="font-ui">{columnJobs.length}</strong></div><div className="kanban-cards">{columnJobs.length === 0 && <div className="kanban-empty">No jobs in this state.</div>}{columnJobs.map((job) => <article className="work-card" key={job.jobId}><div className="work-card__top"><span className="font-ui muted">{job.jobId}</span><StatusPill label={column.label} tone={column.status === "Rejected" ? "danger" : column.status === "Completed" ? "active" : "quiet"} /></div><h3>{job.description ?? "Untitled work order"}</h3><div className="work-card__escrow"><span className="font-ui">{money(job.escrowedAmount ?? job.budget)}</span><span className="muted">escrowed</span></div>{job.deliverableHash && <HashChip hash={job.deliverableHash} simulated label="deliverable" />}{(column.status === "Submitted" || column.status === "Adjudicating") && <div className="work-card__actions"><button disabled={busy === job.jobId} onClick={() => void act(job, true)}>{busy === job.jobId ? "…" : "Approve"}</button><button disabled={busy === job.jobId} onClick={() => void act(job, false)}>{busy === job.jobId ? "…" : "Reject"}</button></div>}</article>)}</div></CardRise>; })}</div></div></div></section>;
}

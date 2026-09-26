"use client";

import { useState } from "react";

import { useAppData } from "@/lib/app-data";
import {
  evaluateJob,
  postVerdict,
  requestVerdict,
  type Job,
  type JobStatus,
} from "@/lib/contract";

/* ── the board's contract ───────────────────────────────────────────────────
   The five payout states, in the order money moves through them. The label is
   the status word the test contract reads (DESIGN.md §7) and the caption is
   what the money is doing in that column, so the column total reads as a
   sentence: "$17,235 held in escrow". */

type Column = {
  status: JobStatus;
  label: string;
  caption: string;
  /** The figure that column's caption is about. */
  total: (job: Job) => number;
};

const COLUMNS: Column[] = [
  {
    status: "Funded",
    label: "FUNDED",
    caption: "held in escrow",
    total: (job) => Number(job.escrowedAmount ?? job.budget ?? 0),
  },
  {
    status: "Submitted",
    label: "SUBMITTED",
    caption: "held, proof in",
    total: (job) => Number(job.escrowedAmount ?? job.budget ?? 0),
  },
  {
    status: "Completed",
    label: "COMPLETED",
    caption: "settled to the provider",
    total: (job) => Number(job.settlement?.amount ?? job.escrowedAmount ?? job.budget ?? 0),
  },
  {
    status: "Rejected",
    label: "REJECTED",
    caption: "returned to the client",
    total: (job) => Number(job.escrowedAmount ?? job.budget ?? 0),
  },
  {
    status: "Adjudicating",
    label: "ADJUDICATING",
    caption: "held for the court",
    total: (job) => Number(job.escrowedAmount ?? job.budget ?? 0),
  },
];

const BOARD_STATES = new Set<string>(COLUMNS.map((column) => column.status));

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

/** MM-DD straight out of the ISO string. A locale formatter would render one
 *  way on the server and another in the browser, which is a hydration
 *  mismatch on a field nobody needs a month name for. */
const stamp = (iso: unknown) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof iso === "string" ? iso : "");
  return match ? `${match[2]}-${match[3]}` : "—";
};

/** When the order entered the state it is in now: the last entry in the
 *  status history the API keeps with every job. */
const enteredAt = (job: Job) => {
  const history = job.statusHistory;
  return history && history.length ? stamp(history[history.length - 1].timestamp) : "\u2014";
};

const truncateHash = (hash: string) => (hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash);

export function WorkKanban() {
  const { spaceId, jobs, refresh, error, actorId } = useAppData();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const act = async (job: Job, action: "approve" | "reject" | "court") => {
    setBusy(job.jobId);
    setMessage(null);
    try {
      if (action === "court") {
        await requestVerdict(spaceId, job.jobId, actorId);
        setMessage("Case referred to the bound court. Payout is halted until a verdict.");
      } else if (job.status === "Adjudicating") {
        await postVerdict(
          spaceId,
          job.jobId,
          job.adjudicator ?? "",
          action === "approve",
          action === "approve" ? "Approved by court" : "Rejected by court",
        );
        setMessage(action === "approve" ? "Court settlement recorded." : "Court rejection refunded the escrow.");
      } else {
        await evaluateJob(
          spaceId,
          job.jobId,
          job.evaluator ?? actorId,
          action === "approve",
          action === "approve" ? "Approved by evaluator" : "Rejected by evaluator",
        );
        setMessage(action === "approve" ? "Settlement recorded." : "Gaia refund recorded.");
      }
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  const offBoard = jobs.filter((job) => !BOARD_STATES.has(job.status)).length;
  const onBoard = jobs.length - offBoard;

  return (
    <section className="work-board" id="work-board">
      <div className="work-board__head">
        <h2>Work orders by payout state</h2>
        <p className="work-board__note">
          {onBoard} of {jobs.length} work orders sit in one of the five states below
          {offBoard ? `; the other ${offBoard} are in a state this board has no column for` : ""}. Each column
          scrolls inside itself, so read its count and its total rather than its height.
        </p>
      </div>

      {message ? <div className="view-flash">{message}</div> : null}
      {error ? <div className="view-flash view-flash--danger">{error}</div> : null}

      <div className="work-board__scroller">
        <div className="kanban-grid">
          {COLUMNS.map((column) => {
            const columnJobs = jobs.filter((job) => job.status === column.status);
            const total = columnJobs.reduce((sum, job) => sum + column.total(job), 0);

            return (
              <section className="kanban-column" key={column.status}>
                <header className="kanban-column__head">
                  <div className="kanban-column__top">
                    <h3 className="kanban-column__title">{column.label}</h3>
                    <span className="kanban-column__count tnum">{columnJobs.length}</span>
                  </div>
                  <p className="kanban-column__sum tnum">
                    {money(total)} {column.caption}
                  </p>
                </header>

                <div className="kanban-cards">
                  {columnJobs.length === 0 ? (
                    <p className="kanban-empty">No jobs in this state.</p>
                  ) : (
                    columnJobs.map((job) => {
                      const pending = busy === job.jobId;
                      const deciding = job.status === "Submitted" || job.status === "Adjudicating";

                      return (
                        <article className="work-card" key={job.jobId}>
                          {/* The description is the human line and it leads. The
                              identifier is database residue, so it sits under
                              it in 11px and truncates. */}
                          <h4 className="work-card__title clamp-2">
                            {job.description?.trim() || "Untitled work order"}
                          </h4>

                          <div className="work-card__row">
                            <span className="work-card__amount">{money(column.total(job))}</span>
                            <span className="work-card__stamp">{enteredAt(job)}</span>
                          </div>

                          <p className="work-card__id">{job.jobId}</p>

                          {job.deliverableHash || job.settlement?.txHash ? (
                            <div className="work-card__proof">
                              {job.deliverableHash ? (
                                <>
                                  <span className="work-card__proof-label">PROOF</span>
                                  <span className="work-card__proof-hash">{truncateHash(job.deliverableHash)}</span>
                                </>
                              ) : null}
                              {job.settlement?.txHash ? (
                                <>
                                  <span className="work-card__proof-label">SETTLEMENT</span>
                                  <span className="work-card__proof-hash">
                                    {truncateHash(job.settlement.txHash)}
                                  </span>
                                </>
                              ) : null}
                            </div>
                          ) : null}

                          {deciding ? (
                            <div className="work-card__actions">
                              {job.status === "Submitted" && job.adjudicator ? (
                                <button
                                  type="button"
                                  className="btn btn--ghost"
                                  disabled={pending}
                                  onClick={() => void act(job, "court")}
                                >
                                  {pending ? "…" : "Refer to court"}
                                </button>
                              ) : null}
                              {job.status === "Submitted" && !job.adjudicator ? (
                                <button
                                  type="button"
                                  className="btn btn--primary"
                                  disabled={pending}
                                  onClick={() => void act(job, "approve")}
                                >
                                  {pending ? "…" : "Approve"}
                                </button>
                              ) : null}
                              {job.status === "Adjudicating" ? (
                                <button
                                  type="button"
                                  className="btn btn--primary"
                                  disabled={pending}
                                  onClick={() => void act(job, "approve")}
                                >
                                  {pending ? "…" : "Approve verdict"}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn--danger"
                                disabled={pending}
                                onClick={() => void act(job, "reject")}
                              >
                                {pending
                                  ? "…"
                                  : job.status === "Adjudicating"
                                    ? "Reject verdict"
                                    : "Reject"}
                              </button>
                            </div>
                          ) : null}
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}

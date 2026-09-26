"use client";

import { WorkKanban } from "@/components/app/WorkKanban";
import { useAppData } from "@/lib/app-data";

import "@/app/views-work.css";

/** Whole USDC, no cents: every figure on this board is a rounded escrow
 *  amount, and a decimal place that never changes is noise. */
const money = (value: string | number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));

const sum = (values: Array<string | number | null | undefined>) =>
  values.reduce<number>((total, value) => {
    const parsed = Number(value);
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);

export function WorkView() {
  const { jobs } = useAppData();

  /* The board renders the five payout states. The Space also holds jobs in
     states the board has no column for, and counting them here is cheaper
     than letting the board's own total quietly disagree with the API's. */
  const onboard = jobs.filter((job) =>
    ["Funded", "Submitted", "Completed", "Rejected", "Adjudicating"].includes(job.status),
  );
  const offBoard = jobs.length - onboard.length;
  const funded = jobs.filter((job) => job.status === "Funded");
  const settled = jobs.filter((job) => job.status === "Completed");
  const refunded = jobs.filter((job) => job.status === "Rejected");

  return (
    <div className="app-view">
      <header className="app-view__header">
        <div>
          <span className="eyebrow">Work</span>
          <h1 className="display balance">Proof before payout.</h1>
          <p>Every state transition stays visible from escrow to settlement or refund.</p>
        </div>
        <span className="status-pill view-figure">{jobs.length} WORK ORDERS</span>
      </header>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">On the board</span>
            <span className="stat-card__value tnum">{onboard.length}</span>
            <span className="stat-card__note">
              {offBoard ? `${offBoard} with no column here` : "every job is in a payout state"}
            </span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">◫</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">In escrow</span>
            <span className="stat-card__value tnum">{money(sum(funded.map((job) => job.escrowedAmount ?? job.budget)))}</span>
            <span className="stat-card__note">held by {funded.length} funded orders</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">◵</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Settled</span>
            <span className="stat-card__value tnum">{settled.length}</span>
            <span className="stat-card__note">{money(sum(settled.map((job) => job.escrowedAmount ?? job.budget)))} released on proof</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">✓</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Refunded</span>
            <span className="stat-card__value tnum">{refunded.length}</span>
            <span className="stat-card__note">{money(sum(refunded.map((job) => job.escrowedAmount ?? job.budget)))} back to the client</span>
          </div>
          <span className="stat-card__inset" aria-hidden="true">
            <span className="stat-card__mark">↩</span>
          </span>
        </div>
      </div>

      <WorkKanban />
    </div>
  );
}

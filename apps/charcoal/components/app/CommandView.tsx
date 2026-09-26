"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import "@/app/views-command.css";

import { HashChip } from "@/components/HashChip";
import { StatusPill } from "@/components/app/StatusPill";
import { EntryGate } from "@/components/app/EntryGate";
import { SpaceAccess } from "@/components/app/SpaceAccess";
import { useAppData } from "@/lib/app-data";
import type { Activity } from "@/lib/contract";

/* ── formatting ──────────────────────────────────────────────────────────── */

const money = (value: string | number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));

/** Anything the ledger hands back is `unknown` on Activity, so it is coerced
 *  once, here, and never trusted to be a number. */
const amount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/* ── the chart's data ───────────────────────────────────────────────────────
   The v1 API has no time series and no money-over-time endpoint. What it does
   have is the ledger itself: GET /spaces/:id/activity returns every event with
   a `type` and, where money moved, an `amount`. Two of those event types carry
   a figure, and both accumulate:

     WORK_FUNDED  → `amount`                        USDC into escrow
     WORK_DENIED  → `denialProof.requestedAmount`   USDC refused by policy

   So the panel plots the cumulative total of each, in ledger order. It does
   not invent a series, and it does not interpolate a shape the ledger does
   not describe. */

const FUNDED = "WORK_FUNDED";
const DENIED = "WORK_DENIED";

const deniedAmount = (event: Activity) =>
  amount((event.denialProof as { requestedAmount?: unknown } | null | undefined)?.requestedAmount);

type Ledger = {
  escrowed: number[];
  refused: number[];
  escrowedTotal: number;
  refusedTotal: number;
  peak: number;
  /** How many distinct timestamps the window actually contains. */
  stamps: number;
  /** Oldest→newest span of the window, in whole minutes, or null if untimed. */
  spanMinutes: number | null;
  untimed: number;
};

function readLedger(ordered: Activity[]): Ledger {
  const escrowed: number[] = [];
  const refused: number[] = [];
  let escrowedTotal = 0;
  let refusedTotal = 0;

  for (const event of ordered) {
    if (event.type === FUNDED) escrowedTotal += amount(event.amount);
    if (event.type === DENIED) refusedTotal += deniedAmount(event);
    escrowed.push(escrowedTotal);
    refused.push(refusedTotal);
  }

  const times = ordered
    .map((event) => Date.parse(String(event.timestamp ?? "")))
    .filter((value) => Number.isFinite(value));

  return {
    escrowed,
    refused,
    escrowedTotal,
    refusedTotal,
    peak: Math.max(escrowedTotal, refusedTotal),
    stamps: new Set(times).size,
    spanMinutes: times.length ? Math.round((Math.max(...times) - Math.min(...times)) / 60000) : null,
    untimed: ordered.length - times.length,
  };
}

/* ── the chart's geometry ────────────────────────────────────────────────────
   The plot is drawn in real CSS pixels, not in viewBox units that then get
   scaled: an 11px axis label inside a 720-unit viewBox stretched to 1074px
   renders at 16px, and squeezed to 600px it renders at 9px, and DESIGN.md
   §4a puts 11px at the floor with nothing below it. So the width is measured
   and the viewBox is the measured width, which makes the scale exactly 1 and
   the type exactly 11px at every viewport. Straight segments only: a smoothed
   curve would draw money that was never moved. */

const PLOT = { height: 200, left: 54, right: 14, top: 10, bottom: 34 };
const PLOT_HEIGHT = PLOT.height - PLOT.top - PLOT.bottom;
const TICKS = 4;
/** Used for the server-rendered pass, before anything has been measured. */
const FALLBACK_WIDTH = 660;

/** A round axis maximum, so the labels are money rather than arithmetic. */
function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const base = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 8, 10]) {
    if (value <= step * base) return step * base;
  }
  return 10 * base;
}

const xFor = (index: number, count: number, width: number) =>
  PLOT.left + (count <= 1 ? 0 : (index / (count - 1)) * Math.max(width - PLOT.left - PLOT.right, 120));

const yFor = (value: number, max: number) =>
  PLOT.top + PLOT_HEIGHT - (max === 0 ? 0 : (value / max) * PLOT_HEIGHT);

const linePath = (values: number[], max: number, width: number) =>
  values
    .map(
      (value, index) =>
        `${index === 0 ? "M" : "L"}${xFor(index, values.length, width).toFixed(1)} ${yFor(value, max).toFixed(1)}`,
    )
    .join(" ");

const areaPath = (values: number[], max: number, width: number) => {
  if (!values.length) return "";
  const floor = (PLOT.top + PLOT_HEIGHT).toFixed(1);
  return `${linePath(values, max, width)} L${xFor(values.length - 1, values.length, width).toFixed(1)} ${floor} L${xFor(
    0,
    values.length,
    width,
  ).toFixed(1)} ${floor} Z`;
};

/* ── the view ────────────────────────────────────────────────────────────── */

export function CommandView() {
  const { space, bounds, capabilities, participants, activity, loading, error } = useAppData();

  // Every hook runs before every early return, or the first render that has
  // data would be a different hook order from the one that did not.
  const ledger = useMemo(() => readLedger([...activity].sort((a, b) => a.seq - b.seq)), [activity]);
  const windowLength = activity.length;
  const chartable = ledger.peak > 0 && windowLength > 1;
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(FALLBACK_WIDTH);

  // The chart draws in real pixels, so it needs the real width of its box.
  useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => setPlotWidth(Math.max(Math.round(node.getBoundingClientRect().width), 200));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [chartable]);

  if (loading && !space) return <div className="app-state">Loading Command Center…</div>;

  /* No Space is not an error, it is the starting position, and it used to render
     as a red "Command Center unavailable" panel. Someone arriving for the first
     time was told the product was broken. The gate now leads the page; the error
     panel is only for a Space that was selected and then failed to load. */
  if (!space) {
    return (
      <div className="app-view">
        <EntryGate />
        <div className="app-state">
          <strong>Nothing to show yet</strong>
          <p>Once you are in a Space, its money, rules and work appear here.</p>
        </div>
      </div>
    );
  }

  if (error || !bounds)
    return (
      <div className="app-state app-state--danger">
        <strong>Command Center unavailable</strong>
        <p>{error ?? "No Space returned by the v1 API."}</p>
        <span>Start the REST server or refresh the active Space.</span>
      </div>
    );

  const total = Number(bounds.dailyBudget);
  const spent = Number(bounds.spentToday);
  const escrow = Number(bounds.escrowed);
  const cap = Number(bounds.maxPerTransaction);

  // The seed reports more in escrow than the Space was ever funded with. That
  // is a property of the data, not of this view, so it is stated rather than
  // hidden and no figure is adjusted to make the books appear to add up.
  const escrowOverBudget = total > 0 && escrow > total;
  const overRatio = total > 0 ? escrow / total : 0;

  const charted = chartable;
  const axisMax = niceMax(ledger.peak);

  const meters = [
    { label: "Per transaction", value: money(cap), share: total > 0 ? cap / total : 0, soft: false, over: false },
    { label: "Spent today", value: `${money(spent)} / ${money(total)}`, share: total > 0 ? spent / total : 0, soft: false, over: false },
    { label: "In escrow", value: money(escrow), share: total > 0 ? escrow / total : 0, soft: true, over: escrowOverBudget },
  ];

  const policyRows = [
    { label: "Per-transaction cap", value: money(cap), note: "same for every authorized actor" },
    { label: "Daily budget", value: money(total), note: "escrow counts against headroom" },
    { label: "Approved counterparties", value: String(capabilities?.rules.allowedCounterparties.length ?? 0), note: "current Space rules" },
    { label: "Denials held", value: String(bounds.denials), note: "zero balance impact" },
  ];

  const actorRole = capabilities?.actor.role ?? "unaffiliated";
  const withAddress = participants.filter((participant) => Boolean(participant.address));

  return (
    <div className="app-view">
      <header className="app-view__header">
        <div>
          <span className="eyebrow">Command Center</span>
          <h1 className="display balance">The Space at a glance.</h1>
          <p>Treasury, authority, and roster state from the same API.</p>
        </div>
        <StatusPill
          label={bounds.denials ? `${bounds.denials} DENIALS HELD` : "NO DENIALS"}
          tone={bounds.denials ? "danger" : "active"}
        />
      </header>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Treasury</span>
            <span className="stat-card__value">{money(bounds.treasuryBalance)}</span>
            <span className="stat-card__note">
              {space.network} · chain {space.chainId}
            </span>
          </div>
          <span className="stat-card__inset">
            <span className="stat-card__mark" aria-hidden="true">$</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">In escrow</span>
            <span className="stat-card__value">{money(escrow)}</span>
            <span className="stat-card__note">
              {escrowOverBudget ? "over the daily budget" : "held against open work"}
            </span>
          </div>
          <span className="stat-card__inset">
            <span className="stat-card__mark" aria-hidden="true">◵</span>
          </span>
        </div>

        <div className="stat-card">
          <div className="stat-card__body">
            <span className="stat-card__label">Daily budget</span>
            <span className="stat-card__value">
              {money(spent)}
              <span className="muted" style={{ fontSize: 18 }}> / {money(total)}</span>
            </span>
            <span className="stat-card__note">
              {escrowOverBudget ? `${money(escrow)} already escrowed` : "escrow counts against headroom"}
            </span>
          </div>
          <span className="stat-card__inset">
            <span className="stat-card__mark" aria-hidden="true">◴</span>
          </span>
        </div>

        <div className={`stat-card${bounds.denials ? " stat-card--alert" : ""}`}>
          <div className="stat-card__body">
            <span className="stat-card__label">Denials held</span>
            <span className="stat-card__value tnum">{bounds.denials}</span>
            <span className="stat-card__note">zero balance impact</span>
          </div>
          <span className="stat-card__inset">
            <span className="stat-card__mark" aria-hidden="true">✕</span>
          </span>
        </div>
      </div>

      {escrowOverBudget ? (
        <div className="command-flag" role="note">
          <span className="command-flag__tag">BOOKS DON'T ADD UP</span>
          <p className="command-flag__text">
            Escrow reads <b>{money(escrow)}</b> against a <b>{money(total)}</b> daily budget and a{" "}
            <b>{money(bounds.treasuryBalance)}</b> treasury — {overRatio.toFixed(1)}× the daily budget.
            These are the figures <span className="ident">GET /api/spaces/{space.id}/bounds</span> returns; nothing in
            this view reconciles them.
          </p>
        </div>
      ) : null}

      <section className="chart-card command-chart">
        <div className="command-chart__head">
          <h2 className="panel__title">Money over time</h2>
          <span className="command-panel__meta">
            {windowLength} ledger events · {space.currency}
          </span>
        </div>

        <div className="command-chart__body">
          {charted ? (
            <>
              <div className="command-chart__headline">
                <span className="command-chart__figure">{money(ledger.escrowedTotal)}</span>
                <span className="command-chart__caption">
                  into escrow across this window, against {money(ledger.refusedTotal)} refused by policy
                </span>
              </div>

              <div className="command-chart__plot" ref={plotRef}>
              <svg
                className="chart-svg"
                viewBox={`0 0 ${plotWidth} ${PLOT.height}`}
                role="img"
                aria-label={`Cumulative USDC across the last ${windowLength} ledger events: ${money(ledger.escrowedTotal)} escrowed into work and ${money(ledger.refusedTotal)} refused by policy.`}
              >
                <defs>
                  {/* The diagonal hatch from DESIGN.md §4, as a pattern: a 1px
                      stripe every 7px at 45°, which is what the CSS
                      repeating-linear-gradient version draws. */}
                  <pattern
                    id="chart-hatch"
                    width="7"
                    height="7"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <line className="command-chart__hatch" x1="0" y1="0" x2="0" y2="7" />
                  </pattern>
                </defs>

                {/* horizontal gridlines only, --chart-grid, 1px */}
                {Array.from({ length: TICKS + 1 }, (_, step) => {
                  const value = (axisMax / TICKS) * step;
                  return (
                    <g key={`grid-${step}`}>
                      <line
                        className="chart-grid"
                        x1={PLOT.left}
                        x2={plotWidth - PLOT.right}
                        y1={yFor(value, axisMax)}
                        y2={yFor(value, axisMax)}
                      />
                      <text
                        className="chart-axis"
                        x={PLOT.left - 10}
                        y={yFor(value, axisMax) + 4}
                        textAnchor="end"
                      >
                        {money(value)}
                      </text>
                    </g>
                  );
                })}

                <path className="chart-area" d={areaPath(ledger.escrowed, axisMax, plotWidth)} />
                <path className="chart-compare" d={linePath(ledger.refused, axisMax, plotWidth)} />
                <path className="chart-line" d={linePath(ledger.escrowed, axisMax, plotWidth)} />

                {/* x axis: ledger order, labelled as such */}
                {[0, Math.floor((windowLength - 1) / 2), windowLength - 1].map((index) => (
                  <text
                    className="chart-axis"
                    key={`x-${index}`}
                    x={xFor(index, windowLength, plotWidth)}
                    y={PLOT.height - 12}
                    textAnchor={index === 0 ? "start" : index === windowLength - 1 ? "end" : "middle"}
                  >
                    event {index + 1}
                  </text>
                ))}
              </svg>
              </div>

              <div className="command-legend">
                <span className="command-legend__item">
                  <span className="command-legend__key" aria-hidden="true" />
                  Escrowed into work <span className="tnum">{money(ledger.escrowedTotal)}</span>
                </span>
                <span className="command-legend__item">
                  <span className="command-legend__key command-legend__key--compare" aria-hidden="true" />
                  Refused by policy <span className="tnum">{money(ledger.refusedTotal)}</span>
                </span>
              </div>

              <p className="command-chart__note">
                Cumulative {space.currency} by ledger event, not by clock time: this window carries{" "}
                {ledger.stamps} timestamp{ledger.stamps === 1 ? "" : "s"}
                {ledger.spanMinutes === null ? "" : ` over ${ledger.spanMinutes} min`}
                {ledger.untimed ? `, and ${ledger.untimed} events carry no timestamp at all` : ""}, so an hours axis
                would be a fiction. Source:{" "}
                <span className="ident">GET /api/spaces/{space.id}/activity?limit={windowLength}</span>.
              </p>
            </>
          ) : (
            <div className="command-chart__empty">
              <strong>No monetary events in this window</strong>
              <p>
                The ledger returned {windowLength} event{windowLength === 1 ? "" : "s"}, none of which moved or refused
                an amount, so there is nothing honest to plot.
              </p>
              <span>Fund a work order or run a sandbox scenario to produce one.</span>
            </div>
          )}
        </div>
      </section>

      <div className="command-grid">
        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">SPACE-WIDE AUTHORITY</h2>
            <span className="command-panel__meta">{actorRole} · every authorized actor</span>
          </div>
          <div className="panel__body">
            <div className="command-meters">
              {meters.map((meter) => (
                <div className="command-meter" key={meter.label}>
                  <div className="command-meter__top">
                    <span className="command-meter__label">{meter.label}</span>
                    <span className="command-meter__value">{meter.value}</span>
                    {meter.over ? (
                      <span className="command-meter__over">{overRatio.toFixed(1)}× over</span>
                    ) : null}
                  </div>
                  <div className="command-meter__track">
                    <span
                      className={`command-meter__fill${meter.soft ? " command-meter__fill--soft" : ""}`}
                      style={{ width: `${Math.max(Math.min(meter.share * 100, 100), 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="command-panel__foot">
              <span>Rules apply equally</span>
              <span className="tnum">{space.members.length} members</span>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel__head">
            <h2 className="panel__title">POLICY MATRIX</h2>
            <span className="command-panel__meta">Space-wide, not actor-specific</span>
          </div>
          <div className="panel__body">
            <div className="command-policy">
              <div className="command-policy__head" aria-hidden="true">
                <span>Rule</span>
                <span>Value</span>
                <span>Applies to</span>
              </div>
              {policyRows.map((row) => (
                <div className="command-policy__row" key={row.label}>
                  <span className="command-policy__label">{row.label}</span>
                  <span className="command-policy__value tnum">{row.value}</span>
                  <span className="command-policy__note">{row.note}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="panel command-grid__full">
          <div className="panel__head">
            <h2 className="panel__title">ROSTER</h2>
            <span className="command-panel__meta tnum">
              {space.members.length} members · {participants.length} participants
            </span>
          </div>
          <div className="panel__body">
            <div className="command-roster">
              {space.members.map((member) => (
                <div className="command-roster__row" key={`member-${member.id}`}>
                  <span className="command-roster__avatar" aria-hidden="true">
                    {member.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="command-roster__text">
                    <span className="command-roster__name">{member.name}</span>
                    <span className="command-roster__role">
                      Space member · {member.role}
                    </span>
                  </span>
                  <StatusPill label="MEMBER" tone="quiet" />
                </div>
              ))}
              {participants.map((participant) => (
                <div className="command-roster__row" key={`participant-${participant.participantId}`}>
                  <span className="command-roster__avatar" aria-hidden="true">
                    {participant.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="command-roster__text">
                    <span className="command-roster__name">{participant.displayName}</span>
                    <span className="command-roster__role">
                      {participant.kind} · {participant.role ?? "participant"}
                    </span>
                  </span>
                  <StatusPill
                    label={participant.status.toUpperCase()}
                    tone={participant.status === "Active" ? "active" : "quiet"}
                  />
                </div>
              ))}
            </div>

            {withAddress.length ? (
              <div className="command-roster__hashes">
                {withAddress.map((participant) => (
                  <HashChip
                    key={participant.participantId}
                    hash={participant.address as string}
                    label={participant.displayName}
                    kind="address"
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <SpaceAccess />
    </div>
  );
}

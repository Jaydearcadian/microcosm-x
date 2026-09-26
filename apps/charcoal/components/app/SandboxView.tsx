"use client";

import { useCallback, useState } from "react";

import "@/app/views-sbx.css";

import { HashChip } from "@/components/HashChip";
import { CardRise } from "@/components/motion";
import { StatusPill } from "@/components/app/StatusPill";
import { useAppData } from "@/lib/app-data";
import {
  fetchBoundsFor,
  fetchJobs,
  probeWorkOrder,
  type SandboxOutcome,
} from "@/lib/contract";

/* ── formatting ──────────────────────────────────────────────────────────── */

const usd = (value: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number(value));

/** Every scenario's deadline is a day out: long enough to be a real order,
 *  short enough that a stale card in the ledger is obviously stale. */
const day = 86_400_000;

/** A counterparty that is deliberately absent from the Space allowlist. */
const STRANGER = "0x9999999999999999999999999999999999999991";

/* ── the four scenarios ──────────────────────────────────────────────────── */

interface Scenario {
  id: string;
  name: string;
  intent: string;
  budget: string;
  provider?: typeof STRANGER;
  actor?: string;
  expect: "denied" | "allowed";
  invariant: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "cap",
    name: "Request above the per-transaction cap",
    intent: "A $900 work order against a $500 cap. The Space must refuse before any state changes.",
    budget: "900.00",
    expect: "denied",
    invariant: "treasury and escrow are untouched, and no Work Order exists",
  },
  {
    id: "counterparty",
    name: "Counterparty outside the allowlist",
    intent: "A within-cap payment to an address the Space has never approved.",
    budget: "250.00",
    provider: STRANGER,
    expect: "denied",
    invariant: "treasury and escrow are untouched, and no Work Order exists",
  },
  {
    id: "actor",
    name: "Actor that is not a participant",
    intent: "A stranger asks the Space to spend on its behalf.",
    budget: "250.00",
    actor: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    expect: "denied",
    invariant: "treasury and escrow are untouched, and no Work Order exists",
  },
  {
    id: "compliant",
    name: "Compliant order inside every rule",
    intent: "The control case: the same flow, inside the cap, to an approved counterparty. This one is meant to move money.",
    budget: "350.00",
    expect: "allowed",
    invariant: "exactly the budget moves from treasury into escrow, and the order is Funded",
  },
];

/* ── one run, and the judge that reads it ──────────────────────────────────
   A scenario names the outcome it expects and the invariant it claims. A run
   is nothing but two API reads around one API write, and the judge compares
   only those two reads — never what the view believed beforehand. */

interface Snapshot {
  balance: string;
  escrowed: string;
  jobs: number;
}

interface Run {
  scenario: Scenario;
  outcome: SandboxOutcome;
  before: Snapshot;
  after: Snapshot;
}

interface VerdictLine {
  label: string;
  ok: boolean;
  detail: string;
}

interface Verdict {
  pass: boolean;
  lines: VerdictLine[];
}

function judge(run: Run): Verdict {
  const { scenario, outcome, before, after } = run;
  const balanceDelta = Number(before.balance) - Number(after.balance);
  const escrowDelta = Number(after.escrowed) - Number(before.escrowed);
  const jobDelta = after.jobs - before.jobs;

  if (scenario.expect === "denied") {
    return {
      pass: outcome.allowed === false,
      lines: [
        {
          label: "Refused by the API",
          ok: outcome.allowed === false,
          detail: outcome.allowed ? "the request was accepted" : `${outcome.status} ${outcome.code}`,
        },
        {
          label: "A DenialProof was issued",
          ok: !outcome.allowed && Boolean(outcome.denialProof),
          detail: !outcome.allowed && outcome.denialProof ? outcome.denialProof.proofHash : "no proof returned",
        },
        {
          label: "Treasury unchanged",
          ok: Math.abs(balanceDelta) < 0.000001,
          detail: `moved ${usd(String(balanceDelta))}`,
        },
        {
          label: "Escrow unchanged",
          ok: Math.abs(escrowDelta) < 0.000001,
          detail: `moved ${usd(String(escrowDelta))}`,
        },
        {
          label: "No Work Order created",
          ok: jobDelta === 0,
          detail: `${jobDelta > 0 ? `+${jobDelta}` : jobDelta} order(s)`,
        },
      ],
    };
  }

  return {
    pass: outcome.allowed === true,
    lines: [
      {
        label: "Accepted by the API",
        ok: outcome.allowed === true,
        detail: outcome.allowed ? `${outcome.status} ${outcome.job.status}` : `${outcome.status} ${outcome.code}`,
      },
      {
        label: "Only the budget left the treasury",
        ok: Math.abs(balanceDelta - Number(scenario.budget)) < 0.000001,
        detail: `moved ${usd(String(balanceDelta))} of ${usd(scenario.budget)}`,
      },
      {
        label: "Escrow received it",
        ok: Math.abs(escrowDelta - Number(scenario.budget)) < 0.000001,
        detail: `escrow moved ${usd(String(escrowDelta))}`,
      },
      {
        label: "Order is Funded",
        ok: outcome.allowed && outcome.job.status === "Funded",
        detail: outcome.allowed ? outcome.job.status : "no order",
      },
    ],
  };
}

/* ── the view ────────────────────────────────────────────────────────────── */

export function SandboxView() {
  const { spaceId, space, participants, actorId, refresh } = useAppData();
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const approved = space?.rules.allowedCounterparties?.find((entry) => /^0x[0-9a-fA-F]{40}$/.test(entry)) ?? "";
  const addressBacked = participants.filter((item) => item.address);
  const provider = addressBacked[0]?.address ?? approved;
  // createJob validates that the provider and evaluator are Space participants,
  // so a Space with no address-backed member cannot run a scenario at all
  const runnable = Boolean(addressBacked.length);

  const run = useCallback(
    async (scenario: Scenario) => {
      if (!spaceId || !runnable) return;
      setBusy(scenario.id);
      setFailure(null);
      try {
        // Both sides of the invariant must be server truth. Reading `before`
        // from the view's own state let it lag the Space selection and its
        // funding, so the verdict compared a stale balance against a live one
        // and reported a refusal scenario as having moved money that never left
        // the Space.
        const [startBounds, startJobs] = await Promise.all([fetchBoundsFor(spaceId, actorId), fetchJobs(spaceId)]);
        const before: Snapshot = {
          balance: startBounds.treasuryBalance,
          escrowed: startBounds.escrowed,
          jobs: startJobs.length,
        };

        const outcome = await probeWorkOrder(spaceId, {
          actorId: scenario.actor ?? actorId,
          provider: scenario.provider ?? provider,
          evaluator: actorId,
          description: `Boundary Sandbox — ${scenario.name}`,
          budget: scenario.budget,
          deadline: new Date(Date.now() + day).toISOString(),
        });

        // re-read the Space so the verdict compares real state, not assumptions
        const [liveBounds, liveJobs] = await Promise.all([fetchBoundsFor(spaceId, actorId), fetchJobs(spaceId)]);
        const after: Snapshot = {
          balance: liveBounds.treasuryBalance,
          escrowed: liveBounds.escrowed,
          jobs: liveJobs.length,
        };

        // One verdict per scenario: the newest run replaces the old one, and
        // the newest run is first, so a reader sees what just happened.
        setRuns((current) => [
          { scenario, outcome, before, after },
          ...current.filter((item) => item.scenario.id !== scenario.id),
        ]);
        await refresh();
      } catch (reason) {
        setFailure(reason instanceof Error ? reason.message : "The scenario could not be run.");
      } finally {
        setBusy(null);
      }
    },
    [spaceId, runnable, actorId, provider, refresh],
  );

  /* ── the states that are not the four cards ────────────────────────────── */

  if (!spaceId) {
    return <div className="app-state">Create or select a Space to run the Boundary Sandbox.</div>;
  }

  if (!runnable) {
    return (
      <div className="app-view">
        <header className="app-view__header">
          <div>
            <span className="eyebrow">Boundary Sandbox</span>
            <h1 className="display balance">One click. One verdict.</h1>
            <p>Each scenario calls the live API and then checks the Space against the invariant it claims.</p>
          </div>
        </header>
        <div className="app-state app-state--danger sandbox-state">
          <strong>This Space has no address-backed participant</strong>
          <p>Add a participant with a wallet address in Onboarding, then the scenarios can run against the real API.</p>
        </div>
      </div>
    );
  }

  const passed = runs.filter((item) => judge(item).pass).length;

  /* ── the four cards ────────────────────────────────────────────────────── */

  return (
    <div className="app-view">
      <header className="app-view__header">
        <div>
          <span className="eyebrow">Boundary Sandbox</span>
          <h1 className="display balance">One click. One verdict.</h1>
          <p>
            Each scenario calls the live API and then checks the Space against the invariant it claims. Nothing here
            is simulated.
          </p>
        </div>
        <StatusPill
          label={runs.length ? `${passed}/${runs.length} PASSED` : "NO RUNS YET"}
          tone={runs.length > 0 && passed === runs.length ? "active" : "quiet"}
        />
      </header>

      {failure ? (
        <div className="sbx-flash sbx-flash--danger" role="status">
          {failure}
        </div>
      ) : null}

      <div className="sandbox-grid">
        {SCENARIOS.map((scenario) => {
          const result = runs.find((item) => item.scenario.id === scenario.id) ?? null;
          const verdict = result ? judge(result) : null;
          const state = verdict ? (verdict.pass ? "pass" : "fail") : "idle";

          return (
            <CardRise className="sandbox-card" key={scenario.id} data-state={state}>
              {/* The expectation, stated before anything is clicked. A refusal
                  is the product working, so it is a quiet pill: the only state
                  on this view that earns the danger tone is a broken run. */}
              <div className="sandbox-card__head">
                <span className={`status-pill ${scenario.expect === "allowed" ? "status-pill--active" : "status-pill--quiet"}`}>
                  {scenario.expect === "denied" ? "EXPECT REFUSED" : "EXPECT ACCEPTED"}
                </span>
                {verdict ? (
                  <StatusPill label={verdict.pass ? "PASS" : "FAIL"} tone={verdict.pass ? "active" : "danger"} />
                ) : null}
              </div>

              <h3 className="sandbox-card__title">{scenario.name}</h3>
              <p className="sandbox-card__intent clamp-3">{scenario.intent}</p>

              <p className="sandbox-card__invariant">
                <span className="sandbox-card__label">Invariant</span>
                <span className="sandbox-card__invariant-text">{scenario.invariant}</span>
              </p>

              <div className="sandbox-card__foot">
                <span className="sandbox-card__amount">
                  <span className="sandbox-card__label">Amount</span>
                  <span className="tnum">{usd(scenario.budget)}</span>
                </span>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void run(scenario)}
                  disabled={busy !== null}
                  aria-busy={busy === scenario.id}
                >
                  {busy === scenario.id ? "Running…" : "Run scenario"}
                </button>
              </div>

              {result && verdict ? (
                <div className="sandbox-card__result">
                  <h4 className={`sandbox-card__verdict-title${verdict.pass ? "" : " is-fail"}`}>
                    {verdict.pass ? "INVARIANTS HELD" : "INVARIANT BROKEN"}
                  </h4>

                  <ul className="sandbox-checks">
                    {verdict.lines.map((line) => (
                      <li className="sandbox-checks__line" key={line.label}>
                        <span className={`status-pill ${line.ok ? "status-pill--active" : "status-pill--danger"}`}>
                          <span aria-hidden="true">{line.ok ? "✓" : "✕"}</span>
                          {line.ok ? "PASS" : "FAIL"}
                        </span>
                        <span className="sandbox-checks__label">{line.label}</span>
                        <span className="sandbox-checks__detail tnum" title={line.detail}>
                          {line.detail}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* The two snapshots the judge compared, shown rather than
                      claimed. Both are read from the API, so the pair is
                      evidence and not a restatement of the verdict. */}
                  <div className="sandbox-readback">
                    <span className="sandbox-readback__title">API readback</span>
                    <div className="sandbox-readback__row">
                      <span className="sandbox-readback__label">Treasury</span>
                      <span className="sandbox-readback__pair tnum">
                        {usd(result.before.balance)} <span aria-hidden="true">→</span> {usd(result.after.balance)}
                      </span>
                    </div>
                    <div className="sandbox-readback__row">
                      <span className="sandbox-readback__label">Escrow</span>
                      <span className="sandbox-readback__pair tnum">
                        {usd(result.before.escrowed)} <span aria-hidden="true">→</span> {usd(result.after.escrowed)}
                      </span>
                    </div>
                    <div className="sandbox-readback__row">
                      <span className="sandbox-readback__label">Work orders</span>
                      <span className="sandbox-readback__pair tnum">
                        {result.before.jobs} <span aria-hidden="true">→</span> {result.after.jobs}
                      </span>
                    </div>
                  </div>

                  {!result.outcome.allowed && result.outcome.denialProof ? (
                    <div className="sandbox-proof">
                      <span className="sandbox-proof__label">DenialProof</span>
                      {result.outcome.denialProof.reasons.length ? (
                        <ul className="sandbox-proof__reasons">
                          {result.outcome.denialProof.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="sandbox-proof__message">{result.outcome.message}</p>
                      )}
                      <HashChip hash={result.outcome.denialProof.proofHash} kind="proof" label="PROOF HASH" />
                    </div>
                  ) : null}

                  {result.outcome.allowed ? (
                    <div className="sandbox-receipt">
                      <span className="sandbox-receipt__label">Work Order {result.outcome.job.jobId}</span>
                      <p className="sandbox-receipt__detail">
                        {result.outcome.job.description} · {usd(result.outcome.job.budget)} ·{" "}
                        {result.outcome.job.status}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardRise>
          );
        })}
      </div>

      <p className="sandbox-note">
        The compliant scenario really does move {usd("350.00")} from the treasury into escrow, and it counts against
        the Space&rsquo;s daily budget. The three refusal scenarios cannot move anything.
      </p>
    </div>
  );
}

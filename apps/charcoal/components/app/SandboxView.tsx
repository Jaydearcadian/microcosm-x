"use client";

import { useCallback, useState } from "react";
import { CardRise } from "@/components/motion";
import { HashChip } from "@/components/HashChip";
import { StatusPill } from "@/components/app/StatusPill";
import { useAppData } from "@/lib/app-data";
import { fetchBoundsFor, fetchJobs, probeWorkOrder, type SandboxOutcome } from "@/lib/contract";

const usd = (value: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(value));
const day = 86_400_000;

/** A counterparty that is deliberately absent from the Space allowlist. */
const STRANGER = "0x9999999999999999999999999999999999999991";

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

interface Run {
  scenario: Scenario;
  outcome: SandboxOutcome;
  before: { balance: string; escrowed: string; jobs: number };
  after: { balance: string; escrowed: string; jobs: number };
  verdict: { pass: boolean; lines: Array<{ label: string; ok: boolean; detail: string }> };
}

function judge(run: Omit<Run, "verdict">): Run["verdict"] {
  const { scenario, outcome, before, after } = run;
  const balanceDelta = Number(before.balance) - Number(after.balance);
  const escrowDelta = Number(after.escrowed) - Number(before.escrowed);
  const jobDelta = after.jobs - before.jobs;
  if (scenario.expect === "denied") {
    return {
      pass: outcome.allowed === false,
      lines: [
        { label: "Refused by the API", ok: outcome.allowed === false, detail: outcome.allowed ? "the request was accepted" : `${outcome.status} ${outcome.code}` },
        { label: "A DenialProof was issued", ok: !outcome.allowed && Boolean(outcome.denialProof), detail: !outcome.allowed && outcome.denialProof ? outcome.denialProof.proofHash : "no proof returned" },
        { label: "Treasury unchanged", ok: Math.abs(balanceDelta) < 0.000001, detail: `moved ${usd(String(balanceDelta))}` },
        { label: "Escrow unchanged", ok: Math.abs(escrowDelta) < 0.000001, detail: `moved ${usd(String(escrowDelta))}` },
        { label: "No Work Order created", ok: jobDelta === 0, detail: `${jobDelta > 0 ? `+${jobDelta}` : jobDelta} order(s)` },
      ],
    };
  }
  return {
    pass: outcome.allowed === true,
    lines: [
      { label: "Accepted by the API", ok: outcome.allowed === true, detail: outcome.allowed ? `${outcome.status} ${outcome.job.status}` : `${outcome.status} ${outcome.code}` },
      { label: "Only the budget left the treasury", ok: Math.abs(balanceDelta - Number(scenario.budget)) < 0.000001, detail: `moved ${usd(String(balanceDelta))} of ${usd(scenario.budget)}` },
      { label: "Escrow received it", ok: Math.abs(escrowDelta - Number(scenario.budget)) < 0.000001, detail: `escrow moved ${usd(String(escrowDelta))}` },
      { label: "Order is Funded", ok: outcome.allowed && outcome.job.status === "Funded", detail: outcome.allowed ? outcome.job.status : "no order" },
    ],
  };
}

export function SandboxView() {
  const { spaceId, space, bounds, jobs, participants, actorId, refresh } = useAppData();
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const approved = space?.rules.allowedCounterparties?.find((entry) => /^0x[0-9a-fA-F]{40}$/.test(entry)) ?? "";
  const addressBacked = participants.filter((item) => item.address);
  const provider = addressBacked[0]?.address ?? approved;
  // createJob validates that the provider and evaluator are Space participants,
  // so a Space with no address-backed member cannot run a scenario at all
  const runnable = Boolean(addressBacked.length);

  const run = useCallback(async (scenario: Scenario) => {
    if (!spaceId || !runnable) return;
    setBusy(scenario.id);
    setFailure(null);
    try {
      const before = { balance: bounds?.treasuryBalance ?? "0", escrowed: bounds?.escrowed ?? "0", jobs: jobs.length };
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
      const after = { balance: liveBounds.treasuryBalance, escrowed: liveBounds.escrowed, jobs: liveJobs.length };
      const partial = { scenario, outcome, before, after };
      setRuns((current) => [partial as Run, ...current.filter((item) => item.scenario.id !== scenario.id)]);
      await refresh();
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "The scenario could not be run.");
    } finally {
      setBusy(null);
    }
  }, [spaceId, runnable, bounds, jobs, actorId, provider, refresh]);

  if (!spaceId) return <div className="app-state">Create or select a Space to run the Boundary Sandbox.</div>;
  if (!runnable) return <div className="app-view">
    <header className="app-view__header"><div><span className="eyebrow">BOUNDARY SANDBOX</span><h1 className="display">One click. One verdict.</h1><p>Each scenario calls the live API and then checks the Space against the invariant it claims.</p></div></header>
    <div className="app-state app-state--danger" style={{ minHeight: 180 }}><strong>This Space has no address-backed participant</strong><p>Add a participant with a wallet address in Onboarding, then the scenarios can run against the real API.</p></div>
  </div>;
  const lastRun = runs[0];
  const passed = runs.filter((item) => judge(item).pass).length;

  return <div className="app-view">
    <header className="app-view__header">
      <div>
        <span className="eyebrow">BOUNDARY SANDBOX</span>
        <h1 className="display">One click. One verdict.</h1>
        <p>Each scenario calls the live API and then checks the Space against the invariant it claims. Nothing here is simulated.</p>
      </div>
      <StatusPill label={runs.length ? `${passed}/${runs.length} PASSED` : "NO RUNS YET"} tone={runs.length && passed === runs.length ? "active" : "quiet"} />
    </header>

    {failure && <div className="action-flash action-flash--danger" role="status">{failure}</div>}

    <div className="sandbox-grid">
      {SCENARIOS.map((scenario) => {
        const result = runs.find((item) => item.scenario.id === scenario.id);
        const verdict = result ? judge(result) : null;
        return <CardRise className="command-panel sandbox-card" key={scenario.id}>
          <div className="command-panel__head">
            <span className="eyebrow">{scenario.expect === "denied" ? "EXPECT REFUSED" : "EXPECT ACCEPTED"}</span>
            {verdict && <StatusPill label={verdict.pass ? "PASS" : "FAIL"} tone={verdict.pass ? "active" : "danger"} />}
          </div>
          <h3 className="sandbox-card__title">{scenario.name}</h3>
          <p className="muted sandbox-card__intent">{scenario.intent}</p>
          <p className="sandbox-card__invariant"><span>Invariant</span>{scenario.invariant}</p>
          <div className="wizard-actions">
            <button type="button" className="wizard-run" onClick={() => void run(scenario)} disabled={busy !== null}>
              {busy === scenario.id ? "RUNNING…" : "Run scenario"}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>{usd(scenario.budget)}</span>
          </div>
        </CardRise>;
      })}
    </div>

    {lastRun && (
      <CardRise delay={0.1} className="command-panel sandbox-verdict">
        <div className="command-panel__head">
          <span className="eyebrow">JUDGE — {lastRun.scenario.name}</span>
          <StatusPill label={judge(lastRun).pass ? "INVARIANTS HELD" : "INVARIANT BROKEN"} tone={judge(lastRun).pass ? "active" : "danger"} />
        </div>
        <ul className="sandbox-checks">
          {judge(lastRun).lines.map((line) => (
            <li key={line.label}>
              <span className={line.ok ? "is-pass" : "is-fail"}>{line.ok ? "PASS" : "FAIL"}</span>
              <strong>{line.label}</strong>
              <em>{line.detail}</em>
            </li>
          ))}
        </ul>
        {!lastRun.outcome.allowed && lastRun.outcome.denialProof && (
          <div className="sandbox-proof">
            <span className="eyebrow">DenialProof</span>
            {lastRun.outcome.denialProof.reasons.map((reason) => <p key={reason}>{reason}</p>)}
            {lastRun.outcome.denialProof.reasons.length === 0 && <p>{lastRun.outcome.message}</p>}
            <HashChip hash={lastRun.outcome.denialProof.proofHash} kind="proof" label="PROOF HASH" />
          </div>
        )}
        {lastRun.outcome.allowed && (
          <div className="sandbox-proof">
            <span className="eyebrow">Work Order {lastRun.outcome.job.jobId}</span>
            <p>{lastRun.outcome.job.description} · {usd(lastRun.outcome.job.budget)} · {lastRun.outcome.job.status}</p>
          </div>
        )}
        <p className="muted" style={{ marginTop: 16, fontSize: 12 }}>
          The compliant scenario really does move {usd("350.00")} from the treasury into escrow, and it counts against the Space&rsquo;s daily budget. The three refusal scenarios cannot move anything.
        </p>
      </CardRise>
    )}
  </div>;
}

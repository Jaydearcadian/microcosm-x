/**
 * Static copy deck + evidence for sections 2–6 (brief §4). Static until the
 * brief says otherwise (§6). Landing examples are illustrative; live app
 * receipts are rendered from the API and linked only when they are onchain.
 */

export const LOOP_NODES = [
  {
    step: "01",
    title: "Request",
    who: "a person creates",
    body: "A founder or teammate files a bounded request inside the Space. Intent is explicit before any money is in play.",
  },
  {
    step: "02",
    title: "Work",
    who: "a provider takes it",
    body: "Creating the Work Order escrows budget out of the Space treasury. Funds are committed, not spendable.",
  },
  {
    step: "03",
    title: "Result",
    who: "proof is required",
    body: "The provider submits a verifiable deliverable hash. No proof, no payout — approval is gated on evidence.",
  },
  {
    step: "04",
    title: "Payment",
    who: "an evaluator approves",
    body: "Approval settles on OKX X Layer. Rejection or expiry triggers a Gaia exception refund — 100% back, $0 lost.",
  },
];

/** Five participant kinds (contract §2 `kind` enum) — equal weight, no hierarchy. */
export const PARTICIPANT_KINDS = [
  { kind: "Human", body: "Founders, operators, and the people who own the outcome." },
  { kind: "Agent", body: "Autonomous workers inside the same rules, with the same ceiling." },
  { kind: "Service", body: "APIs, daemons, and scheduled jobs that do the work." },
  { kind: "Organization", body: "Teams and companies working under one shared agreement." },
  { kind: "Counterparty", body: "The vendors payments are allowed to reach." },
];

/** Policy matrix excerpt — the rules everyone can see (seed Space values). */
export const POLICY_MATRIX = [
  { rule: "Per-transaction cap", value: "$500.00", note: "any requester" },
  { rule: "Daily budget", value: "$2,000.00", note: "cumulative, resets daily" },
  { rule: "Approved counterparties", value: "3", note: "allowlisted before use" },
  { rule: "Treasury balance", value: "$4,530.00", note: "shared, spendable" },
];

/** The $900 denial — evidence of equal enforcement, not the moral of the page. */
export const RULE_DENIAL = {
  title: "A $900 purchase that never happened",
  body: "A request to buy a $900 workstation came through the Space. The cap is $500. The policy engine denied it deterministically — the same verdict it would have returned for a person, an agent, or a service.",
  proofHash: "0xb41e88c2d1f0a9384756aa3bc2de1f0947385a26",
  reasons: ["Exceeds Space per-transaction cap: requested 900.00, limit 500.00"],
  impact: "$0 moved · denial proof written",
};

export const HERO_TICKER = [
  {
    type: "SPACE_FUNDED",
    detail: "Acme Procurement funded +5,000.00 USDC",
    hash: null as string | null,
  },
  {
    type: "WORK_SUBMITTED",
    detail: "job-0001 · GPU cluster · deliverable proof in",
    hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  {
    type: "PAYMENT_SETTLED",
    detail: "350.00 USDC settled · X Layer",
    hash: "0x1f2e3d4c5b6a798809172635445362718f9e8d7c",
  },
  {
    type: "PAYMENT_DENIED",
    detail: "$900.00 over-cap attempt held at the boundary",
    hash: null as string | null,
  },
];

export interface KanbanJob {
  id: string;
  title: string;
  amount: string;
  note: string;
  hash?: string;
}

export const KANBAN_STEPS: Array<{
  key: string;
  column: string;
  jobs: KanbanJob[];
}> = [
  {
    key: "funded",
    column: "Funded",
    jobs: [
      {
        id: "job-0002",
        title: "Dataset delivery Q3",
        amount: "200.00",
        note: "Escrowed from Space treasury · deadline set",
      },
    ],
  },
  {
    key: "submitted",
    column: "Submitted",
    jobs: [
      {
        id: "job-0001",
        title: "GPU cluster allocation",
        amount: "350.00",
        note: "Deliverable proof 0xaaaa…aaaa · awaiting evaluator",
        hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ],
  },
  {
    key: "completed",
    column: "Completed",
    jobs: [
      {
        id: "job-0000",
        title: "Render queue settlement",
        amount: "350.00",
        note: "Settled on X Layer · receipt bound to deliverable hash",
        hash: "0x1f2e3d4c5b6a798809172635445362718f9e8d7c",
      },
    ],
  },
];

export const AUDIT_TRAIL = [
  { seq: 0, type: "SPACE_CREATED", detail: "Acme Procurement created" },
  { seq: 3, type: "SPACE_FUNDED", detail: "Treasury capitalised +5,000.00 USDC" },
  { seq: 4, type: "REQUEST_CREATED", detail: "Provision 100 GPU-hours for the render queue" },
  { seq: 9, type: "WORK_CREATED", detail: "job-0001 · 350.00 USDC escrowed" },
  { seq: 10, type: "WORK_SUBMITTED", detail: "Deliverable proof submitted" },
  { seq: 12, type: "PAYMENT_SETTLED", detail: "350.00 USDC settled on X Layer" },
  { seq: 13, type: "PAYMENT_DENIED", detail: "900.00 USDC over-cap attempt held" },
];

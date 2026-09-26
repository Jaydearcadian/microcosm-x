# Repository Structure

A map of what lives where, and what each file is for. Start here if you are
new to the repository.

## Read in this order

| # | File | What it answers |
|---|---|---|
| 1 | [`README.md`](README.md) | What this is, and how to run it |
| 2 | [`WHITEPAPER.md`](WHITEPAPER.md) | The full argument for the idea |
| 3 | This file | Where everything lives |
| 4 | [`forge/PRODUCT.md`](forge/PRODUCT.md) | What the product does today |
| 5 | [`forge/INVARIANTS.md`](forge/INVARIANTS.md) | What must never break |
| 6 | [`forge/PROOF_LEDGER.md`](forge/PROOF_LEDGER.md) | What is actually proven |
| 7 | [`AGENTS.md`](AGENTS.md) | Rules for changing this code |

## Top level

```text
.
├── README.md                     the front door: what this is, how to run it
├── WHITEPAPER.md                  the long-form argument, 37 sections
├── REPO_STRUCTURE.md              this file
├── AGENTS.md                      rules any agent or human follows before editing
├── MILESTONES.md                  what is built, what is limited, what is next
├── BUILD_FOUNDRY.md               the doctrine this project was built under
├── Repository_Starter_Virtious_Build_Cycle.md
│                                  the starter doctrine, kept for provenance
│
├── apps/
│   └── charcoal/                  the web app (Next.js), eight views
├── contracts/                     Solidity: the settlement kernel
│   ├── src/
│   │   ├── AgenticCommerce.sol    jobs, funding, delivery, verdicts
│   │   ├── SettlementRouter.sol   executes an approved payment atomically
│   │   ├── ClaimEscrow.sol        holds funds until a claim is verified
│   │   ├── EnvelopeRegistry.sol   records signed authorization envelopes
│   │   └── interfaces/
│   └── test/                      Foundry tests, including the negative cases
│
├── packages/
│   ├── policy-engine/             the rules. Pure, no I/O, no chain access
│   ├── server/                    REST + SSE API, persistence, indexer runtime
│   └── sdk/                       typed client for contracts and the API
│
├── mcp/                           the MCP server agents connect to (43 tools)
│   ├── src/
│   │   ├── server.js              protocol surface
│   │   ├── tools.js               tool definitions
│   │   ├── space-store.js         the Space model and every state transition
│   │   ├── indexer.js             reads contract history into projections
│   │   ├── x402.js                payment intents and signatures
│   │   └── xlayer.js              chain client
│   └── test/
│
├── forge/                         the control plane
├── docs/                          reference docs, deployment, handoffs
├── evidence/                      artifacts that back the claims
├── scripts/                       verification and demo entrypoints
├── skills/                        the two skill sets this project was built with
└── Makefile                       the task list
```

## The control plane

`forge/` is where decisions, claims, and evidence live. These files describe
the project; they are not part of the running system.

| File | What it holds |
|---|---|
| `forge/PRODUCT.md` | what the product does today, in plain language |
| `forge/INVARIANTS.md` | the properties that must never break |
| `forge/ARCHITECTURE.md` | the components and how they connect |
| `forge/CORE_HYPOTHESIS.md` | the one claim the whole project rests on |
| `forge/EXECUTION_PLAN.md` | current phase, scope, deliverables |
| `forge/PROOF_LEDGER.md` | every claim with the command that proves it |
| `forge/FAILURES.md` | what broke, and what it taught us |
| `forge/JUDGE_PATH.md` | how a reviewer should walk the evidence |
| `forge/RUBRIC.md` | the criteria being judged against |
| `forge/SUBMISSION.md` | the submitted entry |
| `forge/EVENT.md` | the event this was built for |
| `forge/DEMO_SCRIPT.md`, `forge/DEMO_SHOT_LIST.md` | the demo walkthrough |

## Verification

Everything below runs locally. Nothing needs a hidden dependency.

```bash
make test              # the whole suite
make test-contracts    # Solidity only
make test-runtime      # the Space model and its state transitions
make test-mcp          # the MCP tools
make test-server       # REST, SSE, persistence, indexer
make verify            # the test suite plus the proof ledger

node scripts/verify-proof-ledger.mjs   # every claim, with its evidence
sudo scripts/verify-sequential.sh      # all of the above, in order, with a heartbeat
```

`scripts/verify-sequential.sh` runs every gate one at a time and is built to
survive the terminal that started it. It writes a timestamped result table and
a heartbeat file, so a long run stays observable.

## Where the state lives

There is one source of truth, and it is not the app.

```text
Contracts on OKX X Layer   the settled facts
        ↓
Indexer                    reads history, projects it into the model
        ↓
packages/server            the API and the only writer of state
        ↓
MCP · REST · Web app       three windows onto that same state
```

The app never keeps its own copy of the truth. If two interfaces disagree, the
server is right.

## Naming note

Older files refer to an "OpenRails financial kernel" and a "Gaia" exception
engine. Those names came from an earlier codebase. The rules now live in
`packages/policy-engine`, and refunds are handled by the adjudication path in
`contracts/src/ClaimEscrow.sol`. The names survive in a few comments for
provenance only.

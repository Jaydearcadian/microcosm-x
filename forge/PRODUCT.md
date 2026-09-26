# PRODUCT — what Microcosm is, and what it does today

This is the short, factual version. For the long argument, see
[`/WHITEPAPER.md`](../WHITEPAPER.md). For what is verified, see
[`/forge/PROOF_LEDGER.md`](PROOF_LEDGER.md).

---

## The one-sentence version

Microcosm gives a company one place where its staff and its AI agents work
together and spend money, with rules that limit what an agent may spend and a
permanent record of every attempt.

## The problem it solves

Companies are wiring AI agents into real work right now, and the standard way
to do that is to hand the agent a wallet or a card with real money on it.

That fails in a specific way. An agent follows instructions, and the
instructions can be wrong. It can be tricked by text it reads, it can invent a
vendor, it can loop and retry. Any one of those turns into money leaving the
company with nobody able to explain why.

So companies either refuse to let agents spend anything, or they let agents
spend freely and hope. Neither is useful.

The missing piece is not a better wallet. It is a set of limits the agent
cannot talk its way past.

## The idea: a Space

A **Space** is one company's operating context. It holds:

- **Money** — the balance available to spend.
- **People** — the humans in the company.
- **Agents** — the AI workers.
- **Approved counterparties** — the list of vendors and addresses that may be
  paid.
- **Work** — the jobs and deliverables being asked for.
- **Rules** — the limits, described below.
- **History** — an append-only log of what happened, including refusals.

Everything happens inside a Space. There is no action that exists outside one.

## The rules, and how they are enforced

A payment is only allowed if it passes all of these. They are evaluated
deterministically, in code, before anything moves:

1. The actor is a member of the Space.
2. The actor's role allows spending.
3. The payment is in the Space's own currency.
4. The Space has enough money left.
5. The amount is under the per-payment cap.
6. The day's total stays under the daily budget.
7. The recipient is on the approved list.
8. It is an allowed weekday.
9. It is inside the permitted hours.

If any check fails, the payment is refused and **no money moves**. If all
checks pass, the payment executes and settles on OKX X Layer.

## Refusal is a result, not an error

This is the part that matters most.

When a rule blocks a payment, Microcosm does not quietly drop it and it does
not retry until it gets through. It records a **denial proof**: which rule
failed, which actor asked, which Space it was for, how much was requested, and
what the limit was.

So when a human asks "why didn't the agent buy this?", there is an answer, and
it is a fact rather than a guess. The Boundary Sandbox in the app demonstrates
this against the live API, including a control case that is allowed to move
money, so the refusals are not merely failing closed.

## How an agent connects

Agents do not get a private key. They connect through the **MCP server**, which
exposes 43 tools over one Space. A tool-using agent reads the Space's
capabilities, requests work, and requests payment. Every request goes through
the same rules as a human action, because it is the same code path.

The same operations are also available over REST, and the app is a third window
onto the identical state. An interface cannot become a second source of truth.

## What is running right now

- **Contracts on OKX X Layer testnet** (chain 1952): `AgenticCommerce`,
  `SettlementRouter`, `ClaimEscrow`, `EnvelopeRegistry`.
- **MCP server** with 43 tools covering spaces, participants, work, payments,
  governance, delegation, x402, and audit history.
- **REST and SSE server** with atomic persistence, verified to survive a
  restart.
- **Web app** with eight views: Command, Work, Governance, Delegation, Agent,
  Sandbox, Onboarding, Audit.
- **A live indexer** that reads the contract's history from the chain and
  projects it into the app. It has caught up through block 41894252 and holds
  91 jobs.
- **Live settlement is proven, not simulated.** A real transaction settled with
  a real receipt.

Verification as of this writing: **189 unit and integration tests, 41 browser
end-to-end tests, 41 proof claims across 8 gates.**

The Boundary Sandbox is the clearest single demonstration. Four scenarios, each
declared with its expected outcome in advance, each run against the live API,
each judged against the invariant it claims: three that must be refused and one
that must move money.

## What is deliberately not here

- External wallet extensions are not integrated. Sessions in the app use a
  demo signer.
- One chain, one host. The app and the API run in two places, and the API is a
  single machine.
- No production identity provider, no rate limiting, no encryption in transit.
  The demo runs over plain HTTP.
- No multi-tenant isolation beyond what a Space already provides.

This is a demonstration of a working boundary, not a finished financial
product. The whitepaper describes the intended system; this file describes the
one that runs.

## How to read the rest of the repository

[`/REPO_STRUCTURE.md`](../REPO_STRUCTURE.md) is the map.

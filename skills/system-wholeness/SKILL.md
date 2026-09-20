---
name: system-wholeness
description: System wholeness & integration skill to ensure flow continuity, identity continuity, state continuity, terminal outcome, and consistent truth across all interfaces.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# System Wholeness & Integration Skill

## Purpose

Use this skill when a product has many individually working modules, services, agents, adapters, APIs, UIs, or execution layers, but the overall product still feels fragmented, bolted together, inconsistent, or difficult to use end-to-end.

The goal is not to add more capability.

The goal is to make the existing product behave like **one coherent system**.

This skill is domain-agnostic. It can be used for AI agents, trading systems, fintech, blockchain protocols, SaaS, workflow engines, distributed systems, developer platforms, automation systems, multi-agent systems, and complex consumer applications.

---

# Core Thesis

A system is not complete because all its modules exist.

A system is complete when:

```text
one input
→ flows through every required stage
→ preserves identity, state, authority and provenance
→ reaches a clear terminal outcome
→ exposes the same truth to every interface
```

The defining question is:

> Can a user, agent, developer, operator, or auditor follow one workflow from entry to outcome without mentally filling in a missing step?

If not, the product is not whole yet.

---

# When to Use This Skill

Use it when:

- everything is built but still feels disjointed;
- different interfaces expose different behavior;
- the UI does not drive the actual backend;
- the API exists but is disconnected from the product;
- the SDK duplicates business logic;
- modules pass tests independently but lack end-to-end proof;
- data, authority, IDs, hashes, timestamps, or states drift across layers;
- workflows get stuck without a clear terminal result;
- multiple sources of truth exist;
- an adapter exists but real integration is unproven;
- documentation describes paths that do not exist;
- users or agents must understand internal implementation details to use the system.

---

# Five Wholeness Invariants

## 1. Flow Continuity

Every stage must produce what the next stage actually consumes.

Audit every handoff for:
- ad hoc translation;
- silent defaults;
- dropped provenance;
- recreated IDs;
- schema drift;
- type widening;
- hidden mutation;
- duplicated mapping logic.

## 2. Identity Continuity

One workflow should remain one workflow.

Track distinct identities such as:

```text
requestId
workflowId
artifactId
authorityId
executionId
receiptId
```

Later artifacts should point backward to the exact upstream objects that created them.

## 3. State Continuity

Every layer must agree on system state.

Avoid:

```text
backend: RUNNING
UI: COMPLETE
SDK: UNKNOWN
```

Use canonical state vocabulary and explicit terminal outcomes.

## 4. Authority Continuity

No downstream component may silently gain more scope, money, time, permissions, quantity, or consequence than upstream components granted.

Desired rule:

```text
downstream authority
⊆
upstream authority
```

## 5. Truth Continuity

Web, REST, MCP, SDK, CLI, logs, receipts and docs must describe the same underlying system.

Transport may change representation.

Transport must not change truth.

---

# System Wholeness Method

## Phase 1 — Reconstruct the Actual System

Start from code/runtime evidence, not intended architecture.

Map:

```text
ENTRY SURFACES
↓
APPLICATION BOUNDARY
↓
DOMAIN / WORKFLOW ENGINE
↓
DECISION / POLICY / AUTHORITY
↓
STATE / DATA
↓
ACTION / EXECUTION
↓
RECONCILIATION
↓
TERMINAL RECEIPT
↓
OBSERVATION SURFACES
```

Classify each component as:

```text
COMPOSED
DISCONNECTED
TEST_ONLY
DUPLICATED
UI_ONLY
BACKEND_ONLY
DOCUMENTED_ONLY
STALE
BLOCKED_EXTERNAL
```

Never equate “file exists” with “system works.”

---

## Phase 2 — Audit Every Handoff

For every adjacent pair define:

```text
Producer
Output
Consumer
Input
Validation
Identity binding
State transition
Failure behavior
```

Verify producer output matches consumer input without hidden reconstruction.

---

## Phase 3 — Build the Artifact Chain

Identify canonical artifacts.

Generic example:

```text
Input
↓
Evidence / Observations
↓
Analysis / Decision
↓
Receipt / Provenance
↓
Authority / Policy Object
↓
Assessment
↓
Action Intent
↓
Execution
↓
Reconciliation
↓
Final Receipt
```

For each artifact define:
- artifact type;
- artifact ID;
- workflow ID;
- creator;
- createdAt;
- version;
- canonical hash where applicable;
- upstream references;
- mutability;
- downstream role.

Desired property:

```text
FinalReceipt
→ ActionIntent
→ Authority
→ Decision
→ Evidence
→ Input
```

is traversable.

---

## Phase 4 — Normalize the State Machine

Create one system-wide state taxonomy.

Example:

```text
CREATED
VALIDATING
RUNNING
WAITING
APPROVED
REFUSED
AUTHORIZED
TRIGGERED
SUBMITTING
UNKNOWN
ACKNOWLEDGED
PARTIALLY_COMPLETED
COMPLETED
CANCELLED
EXPIRED
FAILED
RECONCILED
```

Audit:
- exact terminal states;
- retries;
- timeouts;
- expiry;
- restore;
- reconnect;
- stale state;
- partial completion;
- ambiguous consequence;
- recovery.

No workflow should stay indefinitely non-terminal without a documented reason.

---

## Phase 5 — Normalize the Error Model

Expose stable machine-readable errors.

Example:

```text
VALIDATION_FAILED
WORKFLOW_NOT_FOUND
REASONING_INCOMPLETE
POLICY_DENIED
AUTHORITY_EXPIRED
STATE_STALE
ECONOMICS_INVALID
CAPABILITY_DENIED
EXTERNAL_AUTH_REQUIRED
EXTERNAL_BLOCKED
UNKNOWN_CONSEQUENCE
```

Every interface preserves the exact code.

Human interfaces may add explanation.

Machines should not parse arbitrary prose.

---

## Phase 6 — Establish One Application Boundary

All external surfaces converge on one application-service layer.

Preferred:

```text
Web ─────┐
REST ────┤
MCP ─────┤
SDK ─────┼→ Application Service → Canonical Runtime
CLI ─────┤
Agents ──┘
```

Avoid separate business logic per transport.

Invariant:

```text
interface
≠
business logic
≠
authority
```

---

## Phase 7 — Test Transport Equivalence

Run one deterministic workflow through:

```text
direct service
REST
MCP
SDK
Web where applicable
```

Compare:

```text
workflow state
artifact hashes
decision
authority
outcome
receipt
```

Expected:

```text
same semantic result
```

Transport-specific metadata may differ.

Authority may not.

---

## Phase 8 — Classify External Integrations by Plane

Assign each external dependency to a plane:

```text
DATA PLANE
REASONING / TOOL PLANE
AUTHORITY PLANE
EXECUTION PLANE
OBSERVABILITY PLANE
IDENTITY PLANE
PAYMENT PLANE
```

Then verify it is used only for the correct job.

Avoid using analysis tools as authority or slow agent tooling as hot-state infrastructure.

---

## Phase 9 — Audit Product Narrative Continuity

A simple public structure:

```text
LANDING
What is this?

DEMO
Show me how it works.

TRY
Let me run it.

INTEGRATE
How does my system connect?

PROOF
What is actually verified?
```

The sequence should be:

```text
explain
→ prove
→ use
→ integrate
```

Every surface must describe the same underlying workflow.

---

## Phase 10 — Separate Demo From Try

Use:

```text
DEMO
read-only
canonical accepted artifacts
designed to explain
```

versus:

```text
TRY
actual runtime invocation
designed to interact
```

Never present fixture data as a fresh execution.

---

## Phase 11 — Audit Persistence and Reconnect

Ask what survives:

```text
process restart
page refresh
client reconnect
worker restart
network interruption
retry
```

Classify each object:

```text
PERSISTED
IN_MEMORY_ONLY
RECONSTRUCTABLE
EXTERNALLY_RECONCILABLE
NOT_SUPPORTED
```

Do not imply durability that does not exist.

---

## Phase 12 — Audit Security Across Boundaries

Review transitions:

```text
Web → API
API → Service
MCP → Service
SDK → API
External Worker → Adapter
Artifact → Decision
Decision → Authority
Authority → Intent
Intent → Writer
Writer → External System
```

Check:
- prototype pollution;
- inherited properties;
- accessors;
- schema bypass;
- oversized payloads;
- unsafe numbers;
- replay;
- cross-workflow injection;
- role spoofing;
- SSRF;
- credential leakage;
- CORS;
- authorization escalation;
- transport-specific bypass.

Equivalent entry points should receive equivalent trust-boundary validation.

---

## Phase 13 — Verify Authority Monotonicity

Audit:

```text
Policy
↓
Decision
↓
Authority Object
↓
Action Intent
↓
Execution
```

No downstream stage may widen:
- resource;
- scope;
- quantity;
- duration;
- price;
- permissions;
- recipient;
- account;
- network;
- side;
- action type.

---

## Phase 14 — Build End-to-End System Tests

Create at least four system-level cases.

### A. Success

```text
Input
→ analysis
→ approval
→ authority
→ state
→ evaluation
→ action
→ receipt
```

### B. Refusal

```text
approval
→ later conditions deteriorate
→ refusal
→ no consequence
→ terminal receipt
```

### C. Dependency Failure

```text
mandatory component fails
→ no downstream authority
→ clear terminal/error state
```

### D. Ambiguous Consequence

```text
action may have happened
→ UNKNOWN
→ reconcile
→ no blind repeat
```

---

## Phase 15 — Cross-Surface Consistency

For one workflow verify every public surface agrees on:

```text
workflow ID
state
decision
artifact IDs
hashes
authority
outcome
receipt
error/refusal reason
```

---

## Phase 16 — Cold Journey Tests

### Cold Human

Give only the public app.

They should understand:
- what the product is;
- what happened;
- why it happened;
- what is simulated/live/blocked;
- what to do next.

### Cold Agent

Give only API/MCP docs.

It should be able to:

```text
discover capabilities
create workflow
submit input
read result
inspect receipt
```

### Cold Developer

Give only SDK/integration docs.

They should be able to:

```text
install
connect
run one workflow
inspect outcome
```

If repository archaeology is required, integration UX is incomplete.

---

# Gap Classification

Create a System Integration Gap Matrix.

Each gap:

```text
ID
Layer
Current behavior
Expected behavior
Severity
User impact
Agent impact
Root cause
Fix
Test
Status
```

Severity:

```text
P0
core workflow cannot complete

P1
product continuity or public usability breaks

P2
UX/docs inconsistency; system still coherent

P3
enhancement / optimization / future capability
```

Before release:

```text
P0 remaining = 0
P1 remaining = 0
```

Do not use wholeness review to justify P3 feature creep.

---

# Integration Evidence Levels

Use accurate labels:

```text
CONTRACT_ONLY
interface/type exists

LOCAL_INTEGRATED
components compose locally

SYSTEM_INTEGRATION_PASS
end-to-end canonical workflow passes

CONSUMER_PASS
cold external consumer succeeds

HOSTED_PASS
persistent public deployment succeeds

EXTERNAL_PASS
real external dependency succeeds

BLOCKED_EXTERNAL
correct attempt failed because of external dependency
```

Never claim:

```text
adapter implemented
=
external integration proven
```

---

# Wholeness Evidence Receipt

Produce one final system receipt:

```text
canonicalSha
systemMap
entrySurfaces
artifactChain
stateMachine
transportEquivalence
authorityContinuity
provenanceContinuity
mode/environment status
externalIntegration status
coldHuman
coldAgent
coldDeveloper
P0GapsRemaining
P1GapsRemaining
authorityViolations
finalVerdict
```

Target:

```text
P0GapsRemaining = 0
P1GapsRemaining = 0
authorityViolations = 0
```

---

# Independent Whole-System Review

Give a fresh reviewer only:

```text
repository
public app
API docs
MCP docs
SDK example
README
```

Ask:

1. Is this one coherent product?
2. Can I trace one workflow from start to terminal outcome?
3. Do IDs and provenance survive every transition?
4. Do all interfaces expose the same truth?
5. Can an agent use the system without internal knowledge?
6. Can a human understand why an action happened or did not happen?
7. Are any core capabilities only demos or disconnected adapters?
8. Does any component gain authority unexpectedly?
9. Are external integrations correctly classified?
10. Are product claims supported by evidence?

Verdict:

```text
APPROVE
REQUEST_CHANGES
```

Only remediate genuine P0/P1 gaps before release.

---

# Anti-Patterns

## Module Completion Fallacy

```text
Module A passes
Module B passes
Module C passes
therefore product works
```

False. Integration must be separately proven.

## Adapter Theater

```text
Adapter class exists
→ claim integration
```

False. Require actual composition.

## Demo Theater

```text
beautiful UI
→ fixture data
→ no backend workflow
```

False. Demo may use fixtures only when read-only and labeled. Try must invoke the runtime.

## Multiple Sources of Truth

Avoid independent backend, frontend, SDK, and docs status models.

Prefer one canonical source.

## Transport Authority Drift

REST, MCP, SDK, CLI, or Web must not grant different authority for the same operation.

## Silent Fallback

Never silently replace a worker, provider, model, state source, or execution adapter without recording provenance.

## Hidden Defaults

Defaults affecting authority, money, risk, expiry, retries, or execution must be explicit.

## Infinite Non-Terminal State

Every workflow needs progress, a terminal result, or an explicit recoverable blocked state.

## Frontend Reimplementation

Frontend should format truth, not recreate truth.

## Optimization Before Composition

Do not optimize parallelism, latency, caching, providers, or abstractions before end-to-end composition is proven.

---

# Minimal Whole-System Checklist

```text
[ ] one canonical workflow identity
[ ] every stage consumes the previous stage correctly
[ ] provenance traversable end-to-end
[ ] authority cannot expand downstream
[ ] canonical state vocabulary
[ ] canonical error/refusal vocabulary
[ ] all terminal paths terminate
[ ] one application-service boundary
[ ] Web/REST/MCP/SDK converge
[ ] transport-equivalence test
[ ] demo and try clearly separated
[ ] integrations assigned to correct planes
[ ] persistence/reconnect behavior understood
[ ] cross-boundary security reviewed
[ ] success/refusal/failure/recovery E2E tests
[ ] cold human succeeds
[ ] cold agent succeeds
[ ] cold developer succeeds
[ ] P0 gaps = 0
[ ] P1 gaps = 0
[ ] independent review APPROVE
```

---

# Generic Execution Prompt

```text
Perform a whole-system integration and product-coherence audit.

Do not add speculative features.

Reconstruct the actual implementation graph from code/runtime evidence.

Trace one canonical workflow from every supported entry surface through every domain, policy, authority, state, execution and receipt stage.

Audit:
- artifact continuity
- workflow identity continuity
- state continuity
- error continuity
- authority monotonicity
- provenance continuity
- transport equivalence
- external integration plane correctness
- persistence/reconnect behavior
- UI/runtime truth consistency
- documentation/runtime consistency
- cross-boundary security

Classify every component as:
COMPOSED
DISCONNECTED
TEST_ONLY
DUPLICATED
UI_ONLY
BACKEND_ONLY
DOCUMENTED_ONLY
BLOCKED_EXTERNAL

Create a P0–P3 integration gap matrix.

Fix P0 and P1 gaps only.

Build end-to-end success, refusal, dependency-failure and ambiguous-consequence tests.

Run cold human, cold agent and cold developer journeys.

Produce a final system-integration evidence receipt.

Target:

P0 gaps remaining = 0
P1 gaps remaining = 0
authority violations = 0

The goal is not more capability.

The goal is one coherent system.
```

---

# Final Principle

A product is whole when:

```text
someone or something enters
↓
the system knows what happens next
↓
every stage receives exactly what it needs
↓
state and authority remain coherent
↓
the workflow reaches an understandable outcome
↓
every interface tells the same story
```

The product should not require the user to mentally connect the architecture.

**The system itself should provide the continuity.**

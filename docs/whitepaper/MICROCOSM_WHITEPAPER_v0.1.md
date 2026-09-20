# Microcosm

## A Commerce Operating System for Human-Agent Economic Coordination

**Version 0.1 — September 2026**

---

## Abstract

Commerce is becoming increasingly programmable.

People now work alongside software agents. Agents can search, negotiate, create work, call APIs, coordinate with other agents, and increasingly initiate economic actions. At the same time, businesses remain fragmented across communication tools, CRM systems, project systems, accounting software, identity systems, payment systems, and autonomous agents.

The result is a structural problem.

A business may know **who** a person or agent is in one system, **what** they are doing in another, **what** they are allowed to do somewhere else, and **what money moved** in yet another system. The relationship between those facts is often reconstructed after the fact.

Existing infrastructure is solving important parts of this problem independently. Agent identity and lifecycle management are becoming explicit infrastructure concerns. Agent-to-agent interoperability is being standardized through protocols such as A2A. Agent payment authorization is being addressed by systems such as AP2, including mandates and receipts that connect authorization to a specific transaction. The IMF has likewise identified intent, authorization, settlement, traceability, and the tension between probabilistic agents and deterministic payment infrastructure as central issues in agentic payments. ([IMF][1])

Microcosm addresses the layer between these mechanisms and the business itself.

**Microcosm is a Commerce Operating System built around Spaces.**

A **Space** is a bounded operating environment in which people, agents, counterparties, work, rules, authority, money, and activity exist together.

Rather than creating another isolated agent wallet, workflow engine, payment application, or dashboard, Microcosm connects the commercial context surrounding an action:

> **who → did what → for whom → under what authority → according to which rules → with what economic consequence**

Its purpose is to make economic activity legible, governable, executable, and auditable across humans and software.

MCP, APIs, SDKs, and UI are not separate systems. They are interfaces into the same Space.

Financial execution is not the product surface. It is part of the underlying economic kernel.

The long-term objective is a programmable operating system for economic activity.

---

# 1. The Problem

## 1.1 Commerce is fragmented across systems

A modern organization typically distributes its operating state across many systems:

```text
CRM          → relationships
ERP          → operations
Slack/Email  → coordination
Projects     → work
Identity     → people
IAM          → permissions
Wallets      → money
Banks        → settlement
Accounting   → financial records
Agents       → automation
```

Each system may be effective within its own boundary.

The problem emerges at the boundaries.

Suppose a procurement process looks like this:

```text
Human
  ↓
asks agent to source licenses
  ↓
Agent searches vendors
  ↓
Agent negotiates
  ↓
Vendor is selected
  ↓
Agent requests payment
  ↓
Policy is evaluated
  ↓
Payment is executed
  ↓
Settlement occurs
  ↓
Accounting records the result
```

The organization needs to know more than whether the payment succeeded.

It needs to know:

```text
Which human initiated the work?

Which agent acted?

Which Space was the action performed within?

What was the agent authorized to do?

Which rules applied?

Which counterparty was involved?

What work justified the payment?

Which payment was created?

Did settlement actually occur?

What evidence connects all of these events?
```

Without a persistent operating context, these facts become distributed records.

The business must reconstruct the relationship between them.

---

## 1.2 The agent changes the shape of the problem

Traditional software generally executes deterministic instructions.

Agents introduce a different execution model.

An agent may interpret an objective, choose among alternatives, communicate with external systems, and determine intermediate steps autonomously. The IMF describes this as a shift from human-initiated transactions toward agent-mediated decisions and highlights the resulting requirements for authorization, settlement, traceability, compliance, and resilience. ([IMF][1])

This changes what an operating system must know.

It is no longer enough to answer:

> “Does this identity have permission to call this API?”

The system increasingly needs to answer:

> “Does this actor have authority to perform this economic action here, for this purpose, under these constraints, at this time?”

That distinction is fundamental.

---

# 2. The Missing Layer

Many emerging systems address individual pieces of the agentic economy.

### Agent identity

Enterprise systems are extending identity infrastructure to agents. Microsoft Agent 365, for example, gives agents distinct identities and applies permissions, lifecycle management, sponsorship, and auditing through the enterprise identity plane. ([Microsoft Learn][2])

### Agent interoperability

A2A provides a common interaction model for independent agents to discover capabilities and collaborate without exposing their internal state. The current A2A specification defines interoperability between potentially opaque agent systems. ([GitHub][3])

### Agent tool access

MCP provides a standard interface through which applications and agents interact with tools and data. The July 2026 MCP specification further expanded the protocol around stateless operation, authorization, Tasks, extensions, and MCP Apps. ([Model Context Protocol Blog][4])

### Agentic payment authorization

AP2 introduces agent authorization mechanisms using mandates and receipts. Its design connects a user's delegated authority to a particular checkout and payment, and explicitly treats the resulting artifacts as evidence that can be used in disputes. ([Agent Payments Protocol][5])

These are valuable layers.

But they do not by themselves constitute a business operating context.

Microcosm therefore does not attempt to replace them.

It provides the context in which they can compose.

---

# 3. The Microcosm Thesis

The core thesis is:

> **As software agents become participants in economic activity, businesses need a persistent operating context that connects identity, work, authority, counterparties, rules, money, execution, settlement, and evidence.**

Microcosm calls this context a **Space**.

The fundamental relationship is:

```text
                    MICROCOSM
                        │
                      SPACE
                        │
       ┌────────────────┼────────────────┐
       │                │                │
     People           Agents       Counterparties
       │                │                │
       └────────────────┼────────────────┘
                        │
                      Work
                        │
                    Authority
                        │
                     Rules
                        │
                      Money
                        │
                Execution / Settlement
                        │
                     Activity
                        │
                     Evidence
```

A Space therefore becomes the boundary in which economic activity makes sense.

---

# 4. What Is a Space?

A Space is a bounded operating environment where:

* people exist
* agents exist
* counterparties exist
* work exists
* rules exist
* authority exists
* money exists
* activity exists
* evidence accumulates

The Space is not merely a workspace.

It is not merely a wallet.

It is not merely a team.

It is not merely a payment account.

It is the persistent context connecting those things.

### Example

A company creates:

```text
Space: Procurement
```

Inside the Space:

```text
People
├── CFO
├── Procurement Manager
└── Operations Lead

Agents
├── Procurement Agent
└── Invoice Agent

Counterparties
├── Vendor A
├── Vendor B
└── Contractor C

Rules
├── Agent transaction limit: $500
├── Daily procurement limit: $2,000
└── Vendor restriction: approved vendors only

Work
├── Source 20 software licenses
└── Renew annual infrastructure contract

Money
├── Available balance
├── Pending payments
└── Settled payments

Activity
├── requests
├── approvals
├── executions
└── receipts
```

The business does not need separate conceptual systems for every interaction.

The Space holds the context.

---

# 5. Participants

Microcosm recognizes several classes of participants.

## 5.1 People

People initiate work, approve actions, own Spaces, delegate authority, manage relationships, and resolve exceptions.

## 5.2 Agents

Agents can operate inside a Space under explicit authority.

An agent is not automatically equivalent to a person.

Its identity establishes **who the agent is**.

Its authority establishes **what it may do**.

Its execution establishes **what it actually did**.

These are deliberately separate concerns.

## 5.3 Counterparties

Counterparties are external actors involved in economic or operational relationships.

Examples include:

```text
vendor
customer
contractor
service provider
partner
another organization
another agent-controlled business
```

A counterparty can participate in work and economic activity without becoming an owner of the Space.

---

# 6. Authority

Microcosm treats authority as a first-class constraint.

Identity answers:

> Who are you?

Authority answers:

> What are you allowed to do?

Execution answers:

> What did you actually do?

These cannot be collapsed safely into one object.

A Space may grant an agent:

```text
create_work = true

request_payment = true

maximum_payment = $500

allowed_recipients =
    Vendor A
    Vendor B

expires =
    7 days
```

The agent can therefore operate autonomously without receiving unrestricted control.

---

## 6.1 Authority attenuation

Delegated authority must not expand merely because delegation occurred.

If:

```text
Parent Authority = A
Child Authority = B
```

then:

```text
B ⊆ A
```

A child actor cannot acquire powers that its parent did not possess.

This provides a mathematical invariant for delegation and an architectural invariant for authorization.

---

## 6.2 Authorization is contextual

A payment request should not simply ask:

```text
Can Agent X send $350?
```

It should evaluate:

```text
Is Agent X authorized
to send $350
to this counterparty
from this Space
for this action
under the current rules
at this time?
```

The resulting decision should be explicit.

```text
AUTHORIZED
```

or

```text
REFUSED
```

A refusal is itself valuable system state.

Example:

```text
REFUSED

reason:
CAPABILITY_DENIED

space:
procurement-01

actor:
agent-07

authority:
authority-14

requested_amount:
700

maximum_authorized:
500
```

No financial consequence should occur.

---

# 7. Work

Work is the bridge between organizational intent and economic activity.

The system should preserve the connection between:

```text
objective
↓
work
↓
action
↓
financial consequence
```

For example:

```text
Human:
"Get 20 licenses from Vendor A."
```

The system can represent:

```text
Work
  ↓
Procurement request
  ↓
Vendor selected
  ↓
Agent requests $350
  ↓
Authority evaluated
  ↓
Payment executed
  ↓
Settlement confirmed
```

The payment is therefore not an isolated transaction.

It is the economic consequence of work performed inside a Space.

This relationship becomes increasingly important as agents perform more autonomous actions.

---

# 8. Money

Microcosm treats money as part of the operating context rather than an isolated financial application.

A Space may contain:

```text
balances
budgets
payment requests
approvals
pending settlements
completed settlements
recurring obligations
streams
receipts
ledger events
```

The underlying financial machinery can support:

```text
authorization
payment
settlement
recurring payments
streaming
expiry
push/pull flows
micropayments
nanopayments
receipts
ledger
audit
```

The user-facing system does not need to expose all of these as separate primitives.

A user sees:

> “Pay Vendor A $350.”

The financial kernel derives the machinery required to perform that action.

---

# 9. The Financial Kernel

OpenRails provides programmable financial machinery underneath Microcosm.

It should not become the primary product vocabulary.

The architectural relationship is:

```text
                MICROCOSM
                    │
                  SPACE
                    │
          application semantics
                    │
              financial kernel
                    │
                 OpenRails
                    │
     payment / settlement / authority
```

Microcosm therefore imports the useful financial capabilities of OpenRails into a larger operating model.

The objective is not to expose:

```text
envelope
intent
payment primitive
settlement primitive
```

as competing user-facing nouns.

Instead:

```text
Space
  ↓
"Pay Vendor A $350"
```

becomes the natural interaction.

Internally, the system may derive whatever protocol-level constructs are necessary.

---

# 10. One State, Many Interfaces

Microcosm should maintain one canonical system state.

Multiple interfaces provide access to that state.

```text
                    SPACE
                      │
        ┌─────────────┼─────────────┐
        │             │             │
       UI            API           MCP
        │             │             │
        └─────────────┼─────────────┘
                      │
              Application Service
                      │
                  Domain State
```

An SDK may sit on top of the same application boundary.

The important invariant is:

> **Transport must not change semantics.**

A request made through MCP and the same request made through REST should produce the same business result.

For example:

```text
MCP:
payments.request(...)

REST:
POST /spaces/:id/payments
```

Both must resolve to the same application operation.

Neither interface should develop an independent authority model.

Neither interface should maintain a separate state machine.

---

# 11. The Core Execution Loop

The fundamental Microcosm loop is:

```text
Space
  ↓
Participant
  ↓
Context
  ↓
Authority
  ↓
Work
  ↓
Economic Action
  ↓
Execution
  ↓
Settlement
  ↓
Evidence
```

This is the central system loop.

Consider an agent purchasing software.

### Step 1 — Space

The procurement activity occurs inside a specific Space.

### Step 2 — Participant

The Procurement Agent is identified as the actor.

### Step 3 — Context

The agent sees the relevant work, counterparty, rules, and available authority.

### Step 4 — Authority

The system evaluates whether the proposed action is permitted.

### Step 5 — Work

The requested purchase is associated with a concrete business task.

### Step 6 — Economic action

The agent requests payment.

### Step 7 — Execution

The financial kernel submits the payment.

### Step 8 — Settlement

The system determines whether settlement actually completed.

### Step 9 — Evidence

The Space records the relationship between the actor, work, authority, action, payment, and outcome.

This creates a traversable chain:

```text
Evidence
   ↓
Payment
   ↓
Action
   ↓
Authority
   ↓
Rule Decision
   ↓
Work
   ↓
Space
   ↓
Actor
```

---

# 12. State and Finality

Economic systems require explicit state.

Microcosm uses a canonical action lifecycle:

```text
CREATED
   ↓
VALIDATING
   ↓
AUTHORIZED ─────────→ REFUSED
   ↓
SUBMITTING
   ↓
PENDING
   ├────────→ COMPLETED
   ├────────→ FAILED
   ├────────→ EXPIRED
   └────────→ UNKNOWN
                         ↓
                    RECONCILING
                         ↓
                    RECONCILED
```

This matters because:

> payment submitted ≠ payment completed

and:

> network response received ≠ economic truth established

An action can therefore enter an `UNKNOWN` state when the system cannot establish finality.

Rather than pretending success or failure, the system enters reconciliation.

This distinction is fundamental to financial infrastructure.

---

# 13. Evidence

Evidence is a first-class output of system activity.

Microcosm should preserve enough information to answer:

```text
Who acted?
What did they do?
Why did they do it?
What were they authorized to do?
Which rules applied?
Which counterparty was involved?
What financial action occurred?
What happened to that action?
What evidence proves the result?
```

The evidence model should allow downstream artifacts to point backward.

For example:

```text
Receipt
  → payment
      → action
          → authority
              → rule decision
                  → work
                      → Space
                          → participant
```

This creates a system that can be inspected rather than merely observed.

---

# 14. Agentic Commerce

Microcosm does not assume agents will replace businesses.

It assumes businesses will increasingly contain a mixture of:

```text
humans
+
agents
+
software
+
external counterparties
```

This creates a mixed execution environment.

A human may:

```text
define objective
```

An agent may:

```text
research options
```

Another agent may:

```text
negotiate
```

A payment service may:

```text
execute settlement
```

A human may:

```text
resolve an exception
```

The operating system must retain context across those transitions.

That is the role of the Space.

---

# 15. Relationship to Emerging Agent Protocols

Microcosm is intended to compose with emerging standards rather than compete with them.

## MCP

MCP can provide the interface through which agents access Microcosm capabilities.

Example:

```text
spaces.list
spaces.get
spaces.capabilities

work.create
work.get
work.update

payments.request
payments.status

activity.list
```

The agent does not need to understand Microcosm's internal protocol machinery.

It sees capabilities.

---

## A2A

A2A can provide interoperability between independent agents.

Microcosm can provide the business context in which an agent participates.

Conceptually:

```text
A2A
agent ↔ agent communication

MCP
agent ↔ tools/data

Microcosm
agent ↔ business operating context
```

This is complementary rather than substitutive.

A2A's goal is agent interoperability; Microcosm's concern is the persistent economic and organizational context surrounding activity. ([GitHub][3])

---

## AP2 and similar payment authorization systems

AP2 establishes authorization and receipt mechanisms specifically for agent-performed payment transactions. It separates delegation of authority from action authorization and creates cryptographically linked evidence around the payment flow. ([Agent Payments Protocol][5])

Microcosm can use such mechanisms at the financial boundary.

Its additional concern is broader:

```text
Space
 ↓
work
 ↓
authority
 ↓
economic action
 ↓
payment authorization
 ↓
payment
 ↓
settlement
 ↓
evidence
```

The distinction is important.

Microcosm is not attempting to invent another payment mandate format merely for differentiation.

It is attempting to preserve the business context surrounding financial execution.

---

# 16. System Architecture

The conceptual architecture is:

```text
Existing World

Slack / Email / ERP / CRM / Agent / MCP Client / Wallet / Human
                         │
                         ▼
                Microcosm Interfaces
              UI / API / SDK / MCP / A2A
                         │
                         ▼
                 Application Boundary
                         │
                         ▼
                       SPACE
        ┌────────────────┼────────────────┐
        │                │                │
     Identity          Work           Authority
        │                │                │
        └────────────────┼────────────────┘
                         │
                       Rules
                         │
                       Money
                         │
                  Financial Kernel
                         │
             Payment / Settlement
                         │
                     Ledger
                         │
                      Audit
                         │
                     Evidence
```

The application layer owns business semantics.

Transport layers do not independently decide:

```text authorization
state
settlement truth
identity
or business outcomes
```

They request operations from the application boundary.

---

# 17. Canonical Objects

The system deliberately keeps its public vocabulary small.

## Space

The primary operating boundary.

## Participant

A person, agent, or other actor participating in a Space.

## Work

An objective, task, request, or piece of economic activity.

## Authority

The bounded capability granted to an actor.

## Money

Financial value available to or moving through a Space.

## Activity

The observable history of what happened.

## Evidence

The information required to establish why an outcome occurred and how it connects to upstream state.

These objects are enough to describe the core loop without exposing every internal implementation primitive.

---

# 18. Example

Consider a logistics company.

The company creates:

```text
Space: Fleet Operations
```

It adds:

```text
Human:
Operations Manager

Agent:
Fleet Procurement Agent

Counterparties:
Fuel Provider
Parts Supplier
Maintenance Provider
```

The agent receives authority:

```text
Can create work: yes
Can request payments: yes
Maximum payment: $1,000
Approved recipients: registered suppliers
Expiry: 30 days
```

The manager tells the agent:

> "Get replacement tires for Truck 18."

The agent:

```text
1. Creates work
2. Finds an approved supplier
3. Selects a $720 quote
4. Requests payment
```

Microcosm evaluates:

```text
Actor:
Fleet Procurement Agent

Space:
Fleet Operations

Counterparty:
Registered Tire Supplier

Requested:
$720

Maximum:
$1,000

Result:
AUTHORIZED
```

Payment executes.

Settlement completes.

The Space records:

```text
work-481
action-903
authority-17
payment-622
settlement-774
receipt-881
```

A manager can inspect the entire chain.

The company does not need to reconstruct it from five disconnected systems.

---

# 19. Failure as a First-Class Outcome

Autonomous systems will encounter failures.

A useful operating system therefore must make failure legible.

Possible outcomes include:

```text
REFUSED
FAILED
EXPIRED
UNKNOWN
RECONCILING
RECONCILED
```

Each should have machine-readable reasons.

Examples:

```text
CAPABILITY_DENIED
BUDGET_EXCEEDED
RECIPIENT_NOT_ALLOWED
AUTHORITY_EXPIRED
INSUFFICIENT_FUNDS
SETTLEMENT_TIMEOUT
UNKNOWN_NETWORK_RESULT
```

The goal is not to hide uncertainty.

The goal is to make uncertainty operationally manageable.

---

# 20. Security Model

Microcosm separates several security concerns.

### Identity

Establishes the actor.

### Authentication

Establishes control of the identity.

### Authority

Defines permitted action.

### Authorization

Evaluates a specific requested action.

### Execution

Performs the action.

### Settlement

Determines whether the economic consequence finalized.

### Evidence

Preserves the relationship between the above.

This prevents dangerous equivalences such as:

```text
authenticated = authorized
authorized = executed
executed = settled
settled = beneficial
```

They are different states.

---

# 21. Privacy

Not every participant needs to see every piece of information.

A future Microcosm privacy model should therefore distinguish:

```text
existence
identity
membership
authority
action
financial state
evidence
```

Visibility should follow the authority and information requirements of the participant.

This becomes particularly important when Spaces contain external agents, counterparties, subsidiaries, contractors, or multiple organizational roles.

The principle is:

> **The system should preserve enough evidence to establish truth without requiring every participant to see every underlying detail.**

This is a future capability area rather than a claim that the complete privacy architecture exists today.

---

# 22. Composability

Microcosm is designed to sit inside existing environments.

A company should not have to migrate everything to Microcosm merely to use it.

An agent operating through an MCP client should be able to access the Space.

A backend service should be able to call the API.

An application should be able to use the SDK.

A human should be able to use the UI.

Each accesses the same underlying state.

The target model is therefore:

```text
                     MICROCOSM
                         │
           ┌─────────────┼─────────────┐
           │             │             │
          UI            API           MCP
           │             │             │
           └─────────────┼─────────────┘
                         │
                        Space
                         │
             ┌───────────┼───────────┐
             │           │           │
           Work      Authority      Money
             │           │           │
             └───────────┼───────────┘
                         │
                     Activity
```

The interface can change.

The Space does not.

---

# 23. Why Microcosm Is Not Another Agent Wallet

An agent wallet answers:

> Where can the agent spend?

Microcosm asks:

> What is the agent doing, who authorized it, why is it acting, which rules apply, what work does it belong to, who is the counterparty, what economic action occurred, and what happened afterward?

The wallet is therefore one component.

It is not the operating context.

---

# 24. Why Microcosm Is Not Another Workflow Engine

A workflow engine answers:

> What step happens next?

Microcosm additionally answers:

```text
Who can perform the step?
Under what authority?
Within which Space?
Against which counterparty?
With what budget?
With what economic consequence?
What evidence connects the result to the originating work?
```

Workflow is therefore one mechanism inside a broader operating environment.

---

# 25. Why Microcosm Is Not Another Payment Protocol

Payment protocols optimize the movement and authorization of value.

Microcosm is concerned with the business context surrounding value.

The payment may be:

```text
$350 USDC
```

but the operating event is:

```text
Procurement Agent
→ Procurement Space
→ Vendor A
→ Software License Work
→ authorized under policy X
→ $350 payment
→ settlement confirmed
→ evidence recorded
```

The economic event gains meaning from its context.

---

# 26. The Commerce OS

The long-term vision is not a better wallet.

It is a common operating layer for economic activity.

Today:

```text
CRM
ERP
Project Management
Communication
Identity
Payments
Accounting
Agents
```

Tomorrow:

```text
                 MICROCOSM
                     │
                   SPACE
                     │
       ┌─────────────┼─────────────┐
       │             │             │
    Identity        Work          Money
       │             │             │
    Authority      Context      Settlement
       │             │             │
       └─────────────┼─────────────┘
                     │
                  Activity
                     │
                  Evidence
```

This is the Commerce Operating System thesis.

A business is not merely a collection of applications.

It is a collection of relationships, activities, authorities, obligations, decisions, and economic consequences.

Microcosm attempts to make that operating state coherent.

---

# 27. Economic Coordination

The most important property of the system is continuity.

The system should preserve the relationship:

```text
intent
→ work
→ actor
→ authority
→ action
→ payment
→ settlement
→ evidence
```

When this chain remains intact, several things become possible.

### Automation

Agents can act without requiring human intervention for every intermediate step.

### Control

Organizations can constrain what agents are allowed to do.

### Accountability

Organizations can determine which actor caused an action.

### Auditability

Organizations can inspect the evidence behind an outcome.

### Coordination

Multiple humans, agents, and counterparties can operate inside a shared context.

### Programmability

Financial consequences can become part of ordinary business operations.

---

# 28. The First Demonstrable Slice

The full Commerce OS is a long-term system.

The smallest useful proof is much smaller.

The first vertical slice is:

```text
Space
  ↓
Participant
  ↓
Bounded Authority
  ↓
Work
  ↓
Economic Action
  ↓
Payment
  ↓
Settlement
  ↓
Evidence
```

The first implementation milestone should therefore prove:

> A human can establish a Space, authorize an actor, assign work, allow that actor to request an economic action, enforce the authority boundary, execute the financial action, observe settlement, and inspect the resulting evidence.

The strongest adversarial test is equally simple:

```text
Agent authorized:
$500

Agent attempts:
$700

Expected:
REFUSED

Required:
no financial consequence
+
reason
+
actor
+
Space
+
authority
+
action evidence
```

A system that cannot reliably enforce this boundary has not demonstrated the core proposition.

---

# 29. Implementation Strategy

Microcosm should be built as vertical slices.

The build sequence is:

```text
Current Truth
     ↓
Substrate Audit
     ↓
Residual Gap
     ↓
Behavioral Claim
     ↓
Smallest Slice
     ↓
Specification
     ↓
Implementation
     ↓
Adversarial Verification
     ↓
End-to-End Verification
     ↓
Evidence
     ↓
Documentation
     ↓
Independent Review
     ↓
Integration
     ↓
Next Remaining Gap
```

This is deliberate.

Microcosm should not be constructed by separately completing:

```text
backend
contracts
worker
SDK
frontend
```

and assuming the product exists once all modules exist.

The product must be demonstrated through behavior.

---

# 30. Progressive Architecture

## Phase 1 — Space

Establish:

```text
create Space
retrieve Space
list Spaces
```

through one canonical application boundary.

Interfaces:

```text
REST
MCP
```

The same operation must produce equivalent semantic state.

---

## Phase 2 — Participant and Authority

Add:

```text
people
agents
roles
bounded authority
authorization decisions
```

Demonstrate that unauthorized actions fail without economic side effects.

---

## Phase 3 — Work

Connect people and agents to actual business activity.

Example:

```text
create work
assign participant
update work
complete work
```

---

## Phase 4 — Money

Connect work to:

```text
payment request
authorization
execution
settlement
ledger
activity
```

---

## Phase 5 — MCP

Expose Spaces as agent-accessible operating environments.

The agent discovers capabilities rather than internal implementation primitives.

---

## Phase 6 — UI

Build the UI as a window into the same state.

The UI should expose:

```text
Space
current work
people
agents
rules
authority
money
activity
evidence
```

The UI must not become an independent state machine.

---

# 31. What Is Not Being Built Yet

The Commerce OS vision is intentionally larger than the first system.

The following are not prerequisites for proving the core thesis:

```text
generic workflow engine
agent marketplace
agent reputation network
multi-chain abstraction everywhere
ten payment venue adapters
fully generalized streaming framework
fully generalized recurring framework
complex on-chain Space protocol
large enterprise console
CLI-first architecture
```

These should be added only when a real validated requirement demands them.

---

# 32. Trust Model

Microcosm should operate under explicit evidence ceilings.

The system should distinguish:

```text
LOCAL_PASS
LIVE_READ_PASS
VERIFIED_REMOTE
```

A local test does not prove live network behavior.

A mocked settlement does not prove real settlement.

A UI screenshot does not prove backend state.

A successful request does not prove final settlement.

A whitepaper does not prove implementation.

Every claim should therefore be tied to evidence.

---

# 33. Research and Product Boundary

Microcosm separates three categories.

### Proven

Behavior demonstrated by implementation and evidence.

### Enabled

Capabilities the architecture and substrate support but which are not yet fully demonstrated.

### Future

Capabilities that require additional engineering, ecosystem integrations, or validation.

This distinction is essential.

The existence of a design does not constitute evidence that the system works.

---

# 34. Open Questions

The strongest unresolved questions are not technical.

They are product and market questions.

### Question 1

Do businesses actually want a shared operating context joining:

```text
people
agents
work
authority
money
settlement
evidence
```

or will they continue composing specialized systems?

### Question 2

Is Space the correct abstraction for that context?

### Question 3

Where is the first workflow in which this continuity provides enough value to justify adoption?

### Question 4

Can Microcosm integrate into existing environments without forcing organizations to replace the systems they already use?

### Question 5

Which financial and organizational workflows become newly possible once autonomous agents can act inside bounded economic contexts?

These questions should be answered through deployment and evidence rather than assumption.

---

# 35. The Long-Term Unlock

The deepest potential of Microcosm is not merely better coordination between humans and agents.

It is making economic activity programmable at the level of the business context.

Today, a business process often looks like:

```text
Human decision
↓
manual work
↓
application
↓
another application
↓
approval
↓
payment
↓
reconciliation
```

With Microcosm:

```text
Objective
↓
Space
↓
authorized participant
↓
agentic work
↓
policy evaluation
↓
economic action
↓
settlement
↓
evidence
```

This changes money from a disconnected back-office event into an executable part of the operating model.

The resulting system can support businesses in which:

```text
humans decide
agents execute
rules constrain
money moves
settlement confirms
evidence persists
```

---

# 36. Endgame

Microcosm's endgame is:

> **A programmable operating system for economic activity.**

Not a wallet.

Not a payment app.

Not an agent marketplace.

Not a workflow engine.

Not an accounting dashboard.

Not a generic AI workspace.

The operating boundary is the **Space**.

Within it:

```text
people
agents
counterparties
work
authority
rules
money
activity
evidence
```

are connected.

The core loop is:

```text
                    MICROCOSM
                        │
                      SPACE
                        │
              humans + agents
                        │
                       work
                        │
                    authority
                        │
                      rules
                        │
                       money
                        │
                    execution
                        │
                    settlement
                        │
                     evidence
```

The ultimate promise is simple:

> **A business should be able to give people and software a shared place to operate, bounded authority to act, the ability to turn work into economic action, and a persistent record of what happened.**

That is the Commerce OS.

---

# 37. Conclusion

The next generation of commerce will not consist solely of humans operating software.

It will increasingly consist of:

```text
humans
agents
organizations
counterparties
protocols
financial systems
```

acting together.

The infrastructure for each component is emerging independently.

Identity is becoming agent-aware.

Agent interoperability is becoming standardized.

Tool access is becoming standardized.

Payment authorization is becoming programmable.

Settlement is becoming increasingly software-controlled. ([IMF][1])

The missing problem is coordination across those boundaries.

Microcosm proposes that the answer is a persistent operating context:

**Space.**

A Space connects who is acting, what they are doing, what they are allowed to do, who they are dealing with, what money is involved, what happened to the action, and what evidence remains.

The system begins with one vertical loop:

```text
Space
→ Participant
→ Authority
→ Work
→ Economic Action
→ Settlement
→ Evidence
```

Everything beyond that should be earned through evidence.

The destination is a Commerce Operating System where economic activity becomes programmable, bounded, observable, and composable across humans and software.

**Microcosm: the operating context for economic activity.**

---

[1]: https://www.imf.org/en/publications/imf-notes/issues/2026/04/22/how-agentic-ai-will-reshape-payments-575560 "How Agentic AI Will Reshape Payments — IMF"
[2]: https://learn.microsoft.com/en-us/microsoft-agent-365/developer/identity "Agent 365 identity | Microsoft Learn"
[3]: https://github.com/a2aproject/A2A/blob/main/docs/specification.md "A2A Specification | GitHub"
[4]: https://blog.modelcontextprotocol.io/posts/2026-07-28/ "The 2026-07-28 Specification | Model Context Protocol Blog"
[5]: https://ap2-protocol.org/ap2/specification/ "Agent Payments Protocol - AP2"

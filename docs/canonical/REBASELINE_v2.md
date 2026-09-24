# Microcosm Rebaseline v2

## 1. Purpose

This document is the canonical rebaseline for Microcosm.

The objective is not to redesign Microcosm into another system.

The objective is to realign the existing implementation with the product that Microcosm has been intended to become:

> **Microcosm is where a business runs its work with people and software.**

A Space is the operating context for that work.

> **A Space keeps the requests, participants, work, payments, rules, and activity of that operation together.**

People and software can participate in the same Space, receive requests, perform work, return results, and act within the authority granted to them.

Microcosm may use external agent marketplaces, service providers, payment rails, and other infrastructure.

It does not need to become those things.

---

# 2. The Core Product Boundary

## Microcosm

Microcosm owns:

- Spaces
- people
- agents
- participants
- requests
- work
- results
- payments
- rules
- approvals
- activity
- authority
- continuity of the operation

The product question is:

> **"How does this group run this piece of work?"**

## Agent Marketplace

An agent marketplace owns things such as:

- agent discovery
- agent listings
- external provider discovery
- global search
- marketplace matching
- public pricing
- reviews
- marketplace reputation
- hiring from a global pool
- global task distribution

The product question is:

> **"Who can I hire to do this?"**

These are different jobs.

Microcosm must not gradually absorb marketplace responsibilities merely because agents are participants in a Space.

---

# 3. The Simple Test

A useful test for every feature:

> **Remove the marketplace completely. Does Microcosm still make sense?**

The answer must be yes.

A business should be able to create a Space and use:

- its employee
- its contractor
- its own AI agent
- an agent obtained elsewhere
- its supplier
- its evaluator
- its internal automation

without Microcosm needing to operate a marketplace.

An agent marketplace can be an input into a business's operation.

It is not the operating system itself.

---

# 4. Canonical Product Definition

Use this definition across the repository unless explicitly overridden by a later approved rebaseline.

> **Microcosm is a Commerce OS where people, businesses, and software can work together in shared Spaces.**

> **A Space is a place where a group works together.**

> **A Space keeps the people, agents, requests, work, and payments for that group together.**

> **People and agents can receive requests, do work, and act on behalf of a Space within its rules.**

> **When work results in a payment, Microcosm handles the payment and keeps it connected to the work that caused it.**

The core product loop is:

```text
SPACE
  ↓
REQUEST
  ↓
WORK
  ↓
RESULT
  ↓
PAYMENT
  ↓
RECORD
```

This loop is the product.

The blockchain, policy engine, escrow, signatures, adjudication, settlement router, MCP server, and other machinery exist to make this loop reliable.

They are not the product vocabulary.

---

# 5. Canonical Ontology

Keep the external ontology intentionally small.

```text
Microcosm
└── Space
    ├── People
    ├── Agents
    ├── Requests
    ├── Work
    ├── Payments
    └── Activity
```

Optional supporting concepts:

- Result
- Rule
- Approval
- Counterparty

Do not introduce heavyweight nouns unless a real product requirement requires them.

Avoid making these first-class public concepts:

- Pact
- Relationship
- Path
- Envelope
- Court
- Adjudication
- Authority Graph
- Provider Registry
- Agent Reputation Network
- Marketplace Order
- Task Marketplace
- Agent Marketplace

Those concepts may still exist internally where technically useful.

The public product should remain understandable without them.

---

# 6. Space

## Product definition

> **A Space is a place where a group works together.**

A Space contains the operating context necessary for the group to act.

At minimum, a Space can contain:

```text
Space
├── Participants
├── Requests
├── Work
├── Payments
├── Rules
└── Activity
```

Participants may be:

- people
- agents
- services
- organizations
- counterparties

A participant does not have to be discovered through Microcosm.

They can already be known to the business.

---

# 7. Agents

Agents are participants.

Agents are not the product.

The system should support:

```text
Space
  ↓
Agent joins Space
  ↓
Agent receives Request
  ↓
Agent gets required Context
  ↓
Agent performs Work
  ↓
Agent returns Result
  ↓
Space evaluates economic/action rules
  ↓
Payment or other action
  ↓
Activity recorded
```

This is fundamentally different from:

```text
User
  ↓
Search marketplace
  ↓
Find agent
  ↓
Hire agent
  ↓
Marketplace manages task
```

The second flow is not Microcosm's core job.

---

# 8. Requests

The missing or underdeveloped product concept is `Request`.

A Request is the thing that asks a participant to do something.

Examples:

```text
"Review these invoices and flag anything unusual."

"Purchase 100 units from Supplier A."

"Prepare this customer's monthly report."

"Check whether this document satisfies the contract."

"Pay this approved supplier invoice."

"Find the lowest compliant quote from our existing suppliers."
```

A Request belongs to a Space.

It may be:

- assigned directly to a participant
- accepted by a participant in the Space
- routed according to Space rules
- waiting for a participant
- completed
- blocked
- cancelled

Do not interpret routing as marketplace discovery.

The system only needs to answer:

> **"Which participant in this Space should handle this request?"**

It does not need to answer:

> **"Which agent on the internet should we hire?"**

---

# 9. Context

Context is intentionally simple.

> **Context is the information a participant needs to do the current work correctly.**

A request may provide:

- instructions
- files
- prior activity
- relevant records
- permissions
- budget
- counterparties
- constraints
- expected result

The important property is continuity.

The participant should not need to reconstruct the operating context from five unrelated systems.

---

# 10. Work

Work is the execution of a Request.

```text
Request
  ↓
Work
```

Work should contain the operational history necessary to understand what happened.

A specialized Work Order may still exist internally when the work requires:

- escrow
- explicit funding
- deliverable submission
- acceptance
- dispute handling
- settlement conditions

But:

> **Work Order is an implementation mechanism, not the universal product object.**

Do not force every request to become a marketplace-style Work Order.

---

# 11. Results

A participant produces a Result from Work.

```text
Request
  ↓
Work
  ↓
Result
```

A Result can include:

- output
- evidence
- files
- hashes
- structured data
- completion status
- human or machine approval

A Result can trigger another action.

For example:

```text
Invoice review
    ↓
Result: invoice approved
    ↓
Payment Request
    ↓
Policy check
    ↓
Settlement
```

---

# 12. Payments

Payment is connected to the work that caused it.

The desired relationship is:

```text
Request
  ↓
Work
  ↓
Result
  ↓
Payment
```

This gives Microcosm an important property:

> **Money does not exist as an isolated transaction. It can be connected to the business activity that caused it.**

Existing policy and settlement machinery should be preserved where useful.

This includes:

- deterministic policy evaluation
- spending limits
- allowlists
- authorization
- denial proofs
- escrow
- settlement
- transaction evidence
- payment receipts
- OpenRails integration
- X Layer integration

These are implementation capabilities.

They should support the product loop rather than define it.

---

# 13. Rules and Authority

Space rules define what participants are allowed to do.

Examples:

```text
Agent can spend up to $500 per transaction.

Agent can spend up to $2,000 per day.

Agent can only pay approved counterparties.

Human approval is required above $1,000.

Supplier payments require an approved result.

Agent cannot transfer Space funds to an unapproved address.
```

The system should distinguish:

```text
What the participant wants to do
            ↓
What the Space permits
            ↓
What actually happens
```

This is where the existing policy engine and onchain boundary remain valuable.

The product becomes simpler without weakening the underlying authority model.

---

# 14. Activity

Activity provides continuity.

A Space should allow a person to understand:

```text
What was requested?
Who handled it?
What happened?
What result came back?
Was it approved?
What money moved?
Why did the money move?
What was denied?
What requires attention?
```

Activity is the record of the operation.

This is more important than building a generic blockchain activity feed.

---

# 15. Marketplace Boundary

Explicitly prohibit the following from becoming core Microcosm product surfaces:

```text
Agent Marketplace
Agent Store
Agent Directory
Agent Ranking
Global Agent Search
Global Agent Reputation
Public Agent Reviews
Global Task Marketplace
Global Agent Matching
Marketplace Pricing
Marketplace Hiring
Marketplace Commission Engine
```

An integration with an external marketplace can be built later.

For example:

```text
External Agent Marketplace
        ↓
Business obtains agent/service
        ↓
Add participant to Microcosm Space
        ↓
Agent operates inside Space
```

This is a healthy boundary.

Microcosm becomes the environment where the acquired capability is actually used.

---

# 16. What This Means for the Existing Repository

The current implementation has drifted toward:

```text
Space
  ↓
Work Order
  ↓
Client / Provider / Evaluator
  ↓
Deliverable
  ↓
Escrow
  ↓
Settlement
```

This is useful engineering machinery but too narrow as the primary product model.

The target is:

```text
Space
  ↓
Request
  ↓
Participant
  ↓
Work
  ↓
Result
  ↓
Payment
  ↓
Activity
```

Existing Work Order and escrow behavior should be retained where it solves a genuine requirement.

The migration should be additive and incremental.

Do not rewrite the financial kernel merely to make the product vocabulary cleaner.

---

# 17. Migration Strategy

## Slice 1: Space boundary

Confirm that Space is the primary application boundary.

A user should be able to understand:

> "This is the environment where this group operates."

Remove competing public concepts from the primary documentation.

---

## Slice 2: Participants

Create a coherent participant model covering:

```text
Human
Agent
Service
Organization
Counterparty
```

Agents should become ordinary Space participants rather than the center of the architecture.

---

## Slice 3: Request

Introduce the first-class Request model.

Minimum shape:

```text
Request
- id
- spaceId
- createdBy
- assignee
- title
- instructions
- context
- status
- createdAt
- completedAt
```

Do not over-model this.

The immediate objective is to create the product loop.

---

## Slice 4: Agent receives Request

A participant should be able to receive:

```text
Request
+
Context
+
Authority
+
Relevant Space information
```

The system should demonstrate that the agent can act because it is a participant in the Space.

---

## Slice 5: Work

Attach Work to a Request.

```text
Request
  └── Work
```

Existing work/order infrastructure can implement this underneath.

---

## Slice 6: Result

Attach a Result to Work.

```text
Request
  └── Work
        └── Result
```

---

## Slice 7: Payment

Connect payment to the work/result that caused it.

```text
Request
  └── Work
        ├── Result
        └── Payment
```

Existing policy and settlement machinery should remain underneath.

---

## Slice 8: Activity and Evidence

Make the full chain inspectable:

```text
Request
→ Work
→ Result
→ Authorization
→ Payment
→ Receipt
→ Activity
```

This is one of the strongest reasons for Microcosm to exist.

---

## Slice 9: Interface Equivalence

REST, SDK, MCP, and UI should operate over the same product model.

The underlying interface may differ.

The semantic model must not.

For example:

```text
MCP: create_request(...)
REST: POST /requests
SDK: space.requests.create(...)
UI: New Request
```

These should all mean the same thing.

---

## Slice 10: Demo Rebaseline

The demo must stop looking like a marketplace.

Do not lead with:

```text
Find provider
Hire provider
Create work order
Evaluate provider
```

Lead with:

```text
Create Space
Add people
Add agent
Create request
Agent receives request
Agent performs work
Result is returned
Space rules are checked
Payment occurs
Activity records everything
```

The demo should feel like a business running itself with people and software.

---

# 18. Autonomous Procurement as a Scenario

Autonomous procurement can remain the flagship scenario.

But the meaning changes.

It is not:

> "Microcosm is a marketplace where an agent finds and hires providers."

It becomes:

> "A company runs procurement inside a Space, and its procurement agent operates within that Space's authority."

Example:

```text
Company Space
│
├── Procurement Manager
├── Procurement Agent
├── Finance Person
├── Approved Suppliers
│
└── Request
      "Purchase 100 units of X"
             ↓
       Procurement Agent
             ↓
       Reviews approved suppliers
             ↓
       Performs procurement work
             ↓
       Returns result
             ↓
       Payment authorization
             ↓
       Settlement
             ↓
       Activity record
```

The supplier may have been sourced through:

- an existing relationship
- a CRM
- email
- an external marketplace
- a procurement platform
- a human decision

Microcosm does not need to own the discovery step.

Its job starts when the business needs to run the operation.

---

# 19. What to Preserve

Do not throw away useful work already present in the repository.

Preserve and reuse where appropriate:

- Space policy
- deterministic policy engine
- spending controls
- allowlists
- DenialProof
- authorization hashes
- escrow
- settlement
- EIP-712 authorization
- ClaimEscrow
- EnvelopeRegistry
- SettlementRouter
- adjudication infrastructure
- evidence recording
- reorg handling
- OpenRails financial machinery
- X Layer integration work
- MCP infrastructure
- REST/SSE infrastructure
- SDK infrastructure
- activity and receipt infrastructure

The question is not:

> "Should this code exist?"

The question is:

> **"What product concept does this code implement, and is that concept exposed at the right level?"**

---

# 20. What Not to Build Yet

Do not use the rebaseline as an excuse to expand scope.

Do not currently build:

- agent marketplace
- agent store
- global agent discovery
- global agent ranking
- global agent reputation
- cross-space agent federation
- cross-chain architecture
- streaming payments
- MPP
- x402 expansion
- A2A marketplace features
- token economics
- complicated privacy architecture
- enterprise hierarchy
- new settlement primitives
- GenLayer court as a product centerpiece

These can be revisited when a concrete product requirement demands them.

The immediate objective is to prove the core loop.

---

# 21. External Standards

Standards such as:

- x402
- MPP
- AP2
- A2A

should not dictate the product model.

They are integration mechanisms.

The product should remain understandable without them.

The question should always be:

> "What problem inside the Space does this standard solve?"

not:

> "How do we make this standard part of the product?"

---

# 22. Public Language

Prefer:

```text
Space
Participant
Person
Agent
Request
Work
Result
Payment
Rule
Approval
Activity
```

Avoid unnecessary public language such as:

```text
Economic Envelope
Pact
Relationship Kernel
Authority Graph
Adjudication Court
Provider Marketplace
Agent Network
Execution Primitive
```

Technical documentation can use precise implementation terminology where necessary.

The user-facing product should remain ordinary.

---

# 23. Product Principle

The governing principle is:

> **Simple outside. Precise inside.**

A normal business person should be able to understand Microcosm without understanding:

- blockchain
- wallets
- EIP-712
- escrow contracts
- MCP
- OpenRails
- smart contracts
- adjudication
- x402

Those technologies should make the system stronger without becoming the product explanation.

---

# 24. Product Differentiation Hypothesis

The core hypothesis is not:

> "Agents need wallets."

That space is already crowded.

It is not:

> "Businesses need an agent marketplace."

That is also an existing category.

The hypothesis to test is:

> **When business activity involves both humans and software, keeping the request, participants, work, authority, payment, and resulting activity together in one Space can reduce coordination and control problems compared with stitching separate systems together.**

This must remain a hypothesis.

It needs evidence.

---

# 25. Falsification Test

The strongest product challenge is:

> **Could a business accomplish the same thing just as easily by combining Slack, email, an existing project system, an agent platform, and payment infrastructure?**

If the answer is yes, Microcosm has not yet demonstrated a sufficiently important product advantage.

The rebaseline therefore prioritizes proving:

1. continuity of context
2. participant authority
3. request-to-work continuity
4. work-to-payment continuity
5. non-bypassable economic controls
6. inspectable activity

These are more important than adding more integrations.

---

# 26. Acceptance Criteria

The rebaseline is successful when a new user can perform this sequence:

```text
1. Create a Space.

2. Add a person.

3. Add an agent.

4. Create a Request.

5. Agent receives the Request with Context.

6. Agent performs Work.

7. Agent returns a Result.

8. Space evaluates whether an economic action is allowed.

9. Payment executes when authorized.

10. Activity records what happened.
```

And the user can understand the entire sequence without needing to know what an escrow contract, EIP-712 signature, adjudicator, or marketplace is.

---

# 27. Architectural Rule

Microcosm should be understood as:

```text
                    MICROCOSM
                        │
                      SPACE
                        │
       ┌────────────────┼────────────────┐
       │                │                │
   Participants      Requests         Rules
       │                │                │
 People / Agents       Work          Authority
       │                │                │
       └────────────────┼────────────────┘
                        │
                      Result
                        │
                     Payment
                        │
                     Activity
                        │
             Financial / Onchain Machinery
                        │
                    OpenRails
                        │
                    X Layer
```

OpenRails is financial machinery underneath Microcosm.

An external marketplace may be an input to Microcosm.

Neither should define the product.

---

# 28. Final Rebaseline Statement

The repository should converge on this understanding:

> **Microcosm is the operating environment for a business that works with both people and software.**

> **A Space gives that business one place where participants receive requests, perform work, return results, act within defined authority, move money, and retain the resulting activity record.**

> **Microcosm does not need to discover every agent in the world. It needs to make the agents and people already involved in a business operate together reliably.**

That is the product.

Everything else is supporting infrastructure, integration, or future scope.

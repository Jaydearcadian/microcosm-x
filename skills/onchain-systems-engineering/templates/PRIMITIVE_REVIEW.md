# Primitive Review Template

## Claim
What is being claimed as a primitive, unlock or protocol necessity?

## Existing alternatives
- simplest deterministic design
- offchain/database design
- current protocol/standard
- closest research proposal
- incumbent product architecture

## Invariants
Write promises as testable invariants.

## Authority surface
Who can cause what state transition? Scope, target, budget, time, domain, revocation, upgrades.

## State topology
What is shared, local, ephemeral, canonical, append-only, derived? Where is contention manufactured?

## Replay / ordering
What must be unique? What must be ordered? What should commute? What can block unrelated work?

## Verification
What evidence causes acceptance? Can identity/reputation/payment be confused with correctness?

## Finality / settlement
Where does economic consequence finalize? What if source state reorgs or destination execution fails?

## Recovery
Timeout, retry, refund, compensation, challenge, dispute, revocation.

## Attack it
- replay
- cross-domain replay
- race / stale-state execution
- front-running / MEV
- evaluator/validator collusion
- oracle/value manipulation
- shared-state griefing
- upgrade semantic drift
- key/session compromise
- partial-execution loss

## Verdict
- existing mechanism / renamed feature
- useful composition
- candidate primitive
- experiment-ready primitive
- production architecture

Never promote based on narrative alone.

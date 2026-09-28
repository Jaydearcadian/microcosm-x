# Escrow from a Space's own pool — design decision

**Status:** agreed, not started. Deferred deliberately.

Work escrow is funded by the broadcaster and does not debit the Space's onchain
pool, so a Space with work in flight has a pool larger than its ledger claims.
This is contained, not dangerous: paying from a pool requires the reconciliation
row to read `AGREES`, and escrow guarantees it does not, so the Space falls back
to broadcaster funding rather than overspending. The cost is that the fallback is
silent.

The fix is to have the router fund escrow out of the Space's own pool.

## Three constraints that make the obvious fix wrong

Each of these has been read in the source, not inferred.

**1. The kernel will not accept funds from the router.**
`AgenticCommerce.fund` does `if (msg.sender != job.client) revert NotClient()`. The
router can never be the funder, so "the router approves and the kernel pulls" is
not available without changing the kernel.

**2. `SpaceBudget.enforce` is not a read.**
It does `spentByDay[spaceId][day] = already + amount`. Checking the same escrow in
the router *and* in the kernel consumes the daily budget twice for one payment. Any
design that enforces limits in two places is wrong, and wrong in a way that reads as
prudence.

**3. The two calls cannot be atomic.**
The server sends them as sequenced transactions. A router release that debits the
pool, followed by a `fund` that reverts on an over-cap amount, leaves the Space
debited and the money stranded in the broadcaster with no job. This is the same
class of loss as the 15,830 USDC stranded on the retired router, in a new place:
money debited from an account with no matching obligation.

## The design to build

A designated-payer path on `AgenticCommerce`:

- `fund(jobId, expectedBudget, payer)` where `payer` is the settlement router.
- The kernel pulls `transferFrom(payer)` and calls back into the router to debit
  `spaceBalance[spaceId]` and `totalAccounted`.
- One transaction, `enforce` called once, no broadcaster in the path.

The alternative — a router entry point that creates the job, funds it and debits
the pool in a single call — is a larger surface but puts the whole flow in one
place. Either is acceptable; the first is smaller.

## Before deploying it

- Both funded Spaces are bound with owners whose keys are held, so a migration can
  withdraw from the current router and redeposit. Verify that still holds before
  starting: `node mcp/scripts/reconcile-production.mjs` and check `bound` per Space.
- A redeploy empties the pools, so treat it as a migration, not a deploy.
- `totalAccounted` must fall in the same transaction as the pool debit, or the
  difference reads as sweepable excess — and `sweepExcess` is owner-bounded, so it
  would hand a Space's escrowed money to the router owner.

## What not to do

Do not have the router release to the broadcaster and let the broadcaster fund the
kernel as it does today. It makes the books agree and the reconciliation pass, and
it reintroduces exactly the property the pool exists to remove: the broadcaster
holding a Space's money across two transactions, where a failure in the second
strands it. Making the numbers agree is not the goal. Making them true is.

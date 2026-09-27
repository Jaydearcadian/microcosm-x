/**
 * A direct payment and a Work Order are different instruments, and they used to
 * share one.
 *
 * `requestPayment` — a plain disbursement to a vendor, with no deliverable —
 * ran createJob/fund/submit/complete on AgenticCommerce, inventing a Work Order
 * and submitting a deliverable hash that was a constant. Because that contract
 * has no SpaceBudget integration, the Space's signed limits were never consulted
 * for the app's actual payments.
 *
 * These tests pin which contract each path reaches. They use a stub adapter
 * rather than a chain, because the thing under test is the routing decision.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../src/space-store.js';

const founder = privateKeyToAccount(generatePrivateKey());
const agent = privateKeyToAccount(generatePrivateKey());
const VENDOR = '0x1111111111111111111111111111111111111111';

/** Records which onchain instrument the store reached for. */
function recordingSettlement(seen) {
  return async (args) => {
    seen.push(args);
    if (args.kind === 'payment') {
      return { txHash: '0x' + 'ab'.repeat(32), txHashes: { direct: '0x' + 'ab'.repeat(32) } };
    }
    return { txHash: '0x' + 'cd'.repeat(32), txHashes: { complete: '0x' + 'cd'.repeat(32) }, onchainJobId: '7' };
  };
}

function setup() {
  const seen = [];
  const store = new SpaceStore({ seed: false, settlement: recordingSettlement(seen) });
  const space = store.createSpace({ name: 'Routing Space', actorId: founder.address });
  store.bindMemberAddress(space.id, founder.address, founder.address);
  store.fundSpace({ spaceId: space.id, amount: '5000.00', actorId: founder.address });
  store.getSpace(space.id).rules.allowedCounterparties = [VENDOR];
  return { store, spaceId: space.id, seen };
}

test('R1-1: a direct payment is settled as a disbursement, not as a Work Order', async () => {
  const { store, spaceId, seen } = setup();
  const result = await store.requestPayment({
    spaceId, actorId: founder.address, recipient: VENDOR, amount: '50.00',
  });
  assert.equal(result.status, 'SETTLED', JSON.stringify(result));
  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, 'payment', 'a disbursement must not be routed as work');
  // A Work Order settlement is identified onchain by a job id. A disbursement
  // has none, and must not acquire one.
  assert.equal(result.receipt?.onchainJobId ?? result.onchainJobId ?? null, null,
    'a plain payment should not report an onchain job id');
});

test('R1-2: a Work Order still goes through escrow, because it holds money', async () => {
  const { store, spaceId, seen } = setup();
  const job = store.createJob({
    spaceId, actorId: founder.address, provider: VENDOR, evaluator: founder.address,
    description: 'GPU hours', budget: '80.00', deadline: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(job.status, 'Funded', JSON.stringify(job.reasons ?? []));
  // createJob debits the Space offchain; the escrow settlement happens on
  // completion, so drive the job to that point.
  const submitted = store.submitDeliverable({
    spaceId, jobId: job.job.jobId, actorId: VENDOR,
    deliverableHash: `0x${'ab'.repeat(32)}`, evidenceUri: 'ipfs://proof',
  });
  assert.equal(submitted.status, 'Submitted', JSON.stringify(submitted.reasons ?? []));
  const completed = await store.evaluateJob({
    spaceId, jobId: job.job.jobId, evaluatorId: founder.address, approved: true,
  });
  assert.equal(completed.status, 'Completed', JSON.stringify(completed.reasons ?? []));
  const work = seen.filter((entry) => entry.kind === 'work');
  assert.equal(work.length, 1, 'the Work Order should have settled through escrow');
  assert.ok(work[0].deliverableHash, 'escrow settlement carries the deliverable hash');
});

test('R1-3: a payment over the Space cap is still refused before anything reaches a chain', async () => {
  const { store, spaceId, seen } = setup();
  store.getSpace(spaceId).rules.maxPerTransaction = '100.00';
  const result = await store.requestPayment({
    spaceId, actorId: founder.address, recipient: VENDOR, amount: '100.01',
  });
  assert.equal(result.status, 'REJECTED');
  assert.ok(result.reasons.some((r) => /per-transaction cap/.test(r)), result.reasons.join(' | '));
  assert.equal(seen.length, 0, 'a refused payment must not reach the chain');
});

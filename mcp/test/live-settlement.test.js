/**
 * LIVE settlement tests — every test here moves REAL value on a REAL EVM
 * with REAL signed transactions. No mocks, no simulated receipts.
 *
 * Backend is selected by environment (see helpers/chain.mjs):
 *   default : private anvil + fresh kernel (offline-capable, deterministic)
 *   testnet : XLAYER_RPC_URL off-localhost + PRIVATE_KEY (recorded runs)
 *
 * Replaces the former simulated assertions (MCP-2, MCP-4, WORK-3, WORK-8,
 * REQ-6 success legs) with strictly stronger live equivalents.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceStore } from '../src/space-store.js';
import { handleToolCall } from '../src/tools.js';
import { ensureChain } from './helpers/chain.mjs';
import { XLayerAdapter } from '../src/xlayer.js';

let chain;
let adapter;

function futureDeadline(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function txHashOk(h) {
  return typeof h === 'string' && /^0x[0-9a-fA-F]{64}$/.test(h);
}

/** Fresh Space whose treasury triangle is real, funded key-holder addresses. */
async function makeLiveSpace(store, name, { balance = '5000.00', bindOnchain = false } = {}) {
  const D = chain.addrs.deployer;
  const P = chain.addrs.provider;
  const space = store.createSpace({ name, actorId: D, chainId: chain.chainId });
  store.fundSpace({ spaceId: space.id, amount: balance, actorId: D });
  store.addParticipant({ spaceId: space.id, kind: 'Agent', displayName: 'ProviderBot', address: P, actorId: D });
  if (bindOnchain) {
    // A direct payment goes through SettlementRouter, which refuses an unbound
    // Space: nobody has signed for that money leaving it. Signing for it here is
    // what an owner does, and it is why the payment can proceed at all.
    const { spaceIdToBytes32 } = await import('../src/xlayer.js');
    const { bindSpaceOnchain } = await import('./helpers/bind-space.mjs');
    await bindSpaceOnchain({
      rpc: chain.rpc,
      spaceId: spaceIdToBytes32(space.id),
      owner: D,
      key: chain.keys.deployer,
      chainId: chain.chainId,
      asset: chain.contracts.MockERC20,
      recipients: [P],
    });
  }
  return { spaceId: space.id, deployer: D, provider: P };
}

function text(res, data) {
  if (data?.reasons) return JSON.stringify(data.reasons);
  if (data?.error) return JSON.stringify(data.error);
  return JSON.stringify(data).slice(0, 400);
}

async function call(store, tool, args) {
  const res = await handleToolCall(store, tool, args);
  const text = res.content[0].text;
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { _raw: text };
  }
  return { res, data, text };
}

test.before(async () => {
  chain = await ensureChain({ port: 18545 });
  adapter = new XLayerAdapter();
  assert.equal(adapter.chainId, chain.chainId);
});

test.after(async () => {
  if (chain) await chain.cleanup();
});

/**
 * TODO(settlement-routing): a direct payment now goes through
 * SettlementRouter.settleDirect, which asks SpaceBudget first. Exercising that
 * against a live chain needs the Space bound onchain, and the binding helper
 * (mcp/test/helpers/bind-space.mjs) does not yet produce a signature the
 * contract accepts — bind reverts BadSignature. The routing itself is covered
 * without a chain in mcp/test/settlement-routing.test.js; what is missing is
 * the onchain proof that the cap actually stops a real payment.
 */
test('LIVE-1: a compliant direct payment settles REAL USDC through the router', async () => {
  const store = new SpaceStore();
  const { spaceId, deployer, provider } = await makeLiveSpace(store, 'Live Payment', { bindOnchain: true });
  const before = await adapter.balanceOf(provider);

  const { res, data } = await call(store, 'payments_request', {
    spaceId, actorId: deployer, recipient: provider, amount: '25.00', memo: 'Live compute allocation',
  });
  assert.equal(res.isError, undefined, `payment failed: ${text(res, data)}`);
  assert.equal(data.status, 'SETTLED', JSON.stringify(data).slice(0, 300));
  assert.ok(txHashOk(data.receipt.txHash), 'receipt carries a real tx hash');
  // A disbursement, not a Work Order: no job, no deliverable, no escrow.
  assert.ok(txHashOk(data.receipt.txHashes.direct), 'the disbursement carries its own tx hash');
  assert.ok(!data.receipt.onchainJobId, 'a plain payment must not report an onchain job id');
  assert.ok(!('create' in data.receipt.txHashes), 'no Work Order was created for a payment');

  assert.equal(store.getSpace(spaceId).balance, '4975.000000');
  const after = await adapter.balanceOf(provider);
  assert.equal(after - before, 25_000_000n, 'the provider gained exactly 25 USDC onchain');
});

test('LIVE-2: full work loop settles onchain via the provider key (replaces WORK-3)', async () => {
  const store = new SpaceStore();
  const { spaceId, deployer, provider } = await makeLiveSpace(store, 'Live Work');
  const before = await adapter.balanceOf(provider);

  const created = await call(store, 'work_create', {
    spaceId, actorId: deployer, provider, evaluator: deployer,
    description: 'Live GPU job', budget: '40.00', deadline: futureDeadline(),
  });
  assert.equal(created.data.status, 'Funded');
  const jobId = created.data.job.jobId;

  const submitted = await call(store, 'work_submit', {
    spaceId, jobId, actorId: provider,
    deliverableHash: `0x${'b'.repeat(64)}`, evidenceUri: 'ipfs://QmLive001',
  });
  assert.equal(submitted.data.status, 'Submitted');

  // The onchain submit MUST come from the provider key (NotProvider reverts
  // otherwise) — success here proves the distinct-key path for real.
  const evaluated = await call(store, 'work_evaluate', {
    spaceId, jobId, evaluatorId: deployer, approved: true, feedback: 'Live verified',
  });
  assert.equal(evaluated.data.status, 'Completed');
  assert.ok(txHashOk(evaluated.data.receipt.txHash));

  const after = await adapter.balanceOf(provider);
  assert.equal(after - before, 40_000_000n);
  assert.equal(store.getSpace(spaceId).balance, '4960.000000');
});

test('LIVE-3: court approval settles REAL escrow (replaces WORK-8)', async () => {
  const store = new SpaceStore();
  const { spaceId, deployer, provider } = await makeLiveSpace(store, 'Live Court');
  const before = await adapter.balanceOf(provider);

  const created = await call(store, 'work_create', {
    spaceId, actorId: deployer, provider, evaluator: deployer,
    adjudicator: 'court-01', rubricHash: `0x${'1'.repeat(64)}`,
    description: 'Court-gated live job', budget: '30.00', deadline: futureDeadline(),
  });
  const jobId = created.data.job.jobId;
  await call(store, 'work_submit', {
    spaceId, jobId, actorId: provider, deliverableHash: `0x${'c'.repeat(64)}`,
  });
  const referred = await call(store, 'work_request_verdict', { spaceId, jobId, actorId: deployer });
  assert.equal(referred.data.status, 'Adjudicating');

  const verdict = await call(store, 'work_post_verdict', {
    spaceId, jobId, adjudicatorId: 'court-01', approved: true, reason: 'Court accepts (live)',
  });
  assert.equal(verdict.data.status, 'Completed');
  assert.ok(txHashOk(verdict.data.receipt.txHash));

  const after = await adapter.balanceOf(provider);
  assert.equal(after - before, 30_000_000n);
});

test('LIVE-4: denials touch NOTHING onchain even with a chain configured (replaces MCP-4)', async () => {
  const store = new SpaceStore();
  const { spaceId, deployer, provider } = await makeLiveSpace(store, 'Live Denial');
  const before = await adapter.balanceOf(provider);

  const { res, data } = await call(store, 'payments_request', {
    spaceId, actorId: deployer, recipient: provider, amount: '900.00', memo: 'Over-cap',
  });
  assert.equal(res.isError, true);
  assert.equal(data.status, 'REJECTED');
  assert.ok(data.denialProof);

  assert.equal(await adapter.balanceOf(provider), before);
  assert.equal(store.getSpace(spaceId).balance, '5000.000000');

  const { activity } = JSON.parse((await call(store, 'activity_list', { spaceId })).res.content[0].text);
  assert.ok(activity.some((a) => a.type === 'PAYMENT_DENIED'));
});

test('LIVE-5 (negative): bad provider address fails LOUD, job untouched, no receipt', async () => {
  const store = new SpaceStore();
  const { spaceId, deployer } = await makeLiveSpace(store, 'Live Loud Failure');

  // The provider is approved as a payable counterparty first, by naming it as
  // a participant. An unapproved provider is now refused at creation, which is
  // correct and is covered by SPACE-9, so without this the test would no longer
  // reach settlement at all. What it is here to prove is the other failure: an
  // approved counterparty whose address cannot actually be paid on chain.
  store.addParticipant({
    spaceId, kind: 'Agent', displayName: 'UnpayableBot', address: 'not-an-address', actorId: deployer,
  });

  const created = await call(store, 'work_create', {
    spaceId, actorId: deployer, provider: 'not-an-address', evaluator: deployer,
    description: 'Unsettleable job', budget: '20.00', deadline: futureDeadline(),
  });
  // Escrow itself is chain-free, so creation succeeds…
  assert.equal(created.data.status, 'Funded');
  const jobId = created.data.job.jobId;
  // …but the provider id cannot submit either (not the provider).
  const submitted = await call(store, 'work_submit', {
    spaceId, jobId, actorId: 'not-an-address', deliverableHash: `0x${'d'.repeat(64)}`,
  });
  assert.equal(submitted.data.status, 'Submitted');

  const evaluated = await call(store, 'work_evaluate', {
    spaceId, jobId, evaluatorId: deployer, approved: true,
  });
  assert.equal(evaluated.res.isError, true);
  assert.match(evaluated.text, /EVM address/);

  const job = store.getJob({ spaceId, jobId });
  assert.equal(job.status, 'Submitted');
  assert.equal(job.settlement, null);
});



test('LIVE-6: trace walks request→work→REAL payment→receipt (replaces REQ-6)', async () => {
  const store = new SpaceStore();
  // Bound onchain, because the payment at the end of this trace is a
  // disbursement through the router now, and the router refuses an unbound
  // Space.
  const { spaceId, deployer, provider } = await makeLiveSpace(store, 'Live Trace', { bindOnchain: true });

  const req = JSON.parse((await call(store, 'requests_create', {
    spaceId, createdBy: deployer, title: 'Live trace buy',
  })).res.content[0].text).request;
  await call(store, 'requests_accept', { spaceId, requestId: req.requestId, actorId: deployer });

  const work = JSON.parse((await call(store, 'work_create', {
    spaceId, actorId: deployer, provider, evaluator: deployer,
    description: 'Trace job', budget: '15.00', deadline: futureDeadline(), requestId: req.requestId,
  })).res.content[0].text);
  await call(store, 'work_submit', {
    spaceId, jobId: work.job.jobId, actorId: provider, deliverableHash: `0x${'e'.repeat(64)}`,
  });
  const done = await call(store, 'work_evaluate', {
    spaceId, jobId: work.job.jobId, evaluatorId: deployer, approved: true,
  });
  assert.equal(done.data.status, 'Completed');
  await call(store, 'requests_complete', {
    spaceId, requestId: req.requestId, actorId: deployer, result: { output: 'delivered live' },
  });

  const trace = JSON.parse((await call(store, 'activity_trace', {
    spaceId, requestId: req.requestId,
  })).res.content[0].text);
  assert.equal(trace.chain.request.requestId, req.requestId);
  assert.ok(trace.chain.work);
  assert.ok(trace.chain.payment);
  assert.ok(txHashOk(trace.chain.payment.txHash));
  // This payment is the Work Order's escrow release, not a disbursement, so it
  // still goes through the escrow kernel and carries a job id. Escrow holds
  // money against a deliverable, which is what that instrument is for; the
  // direct route above is for payments that have no deliverable.
  assert.ok(txHashOk(trace.chain.payment.txHashes.complete));
  assert.ok(trace.chain.payment.onchainJobId);
  assert.ok(!('simulated' in trace.chain.payment));
});

/**
 * Wizard-path onboarding via the SDK, LIVE end to end (M5 + onboarding).
 *
 * Multi-agent cast, one business loop, real money:
 *   founder (human) creates + funds the Space
 *   provider agent gets the request, delivers, gets paid REAL USDC
 *   evaluator agent approves (Space-level authority; treasury key settles)
 *   a second request is blocked with reasons (denial path, no chain)
 *   trace walks request → work → REAL payment → receipt
 *
 * Backend via chain harness (anvil default, testnet when configured).
 * Run: node --test test/wizard.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../../server/src/server.js';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { SpaceClient, PolicyDenial } from '../src/client.js';
import { ensureChain } from '../../../mcp/test/helpers/chain.mjs';
import { XLayerAdapter } from '../../../mcp/src/xlayer.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { signIn } from './helpers-auth.mjs';

let chain;
let adapter;
let client;
let ctx;
let store;
let founderAccount;

const F = (d = 7) => new Date(Date.now() + d * 86400000).toISOString();
const txOk = (h) => typeof h === 'string' && /^0x[0-9a-fA-F]{64}$/.test(h);

test.before(async () => {
  chain = await ensureChain({ port: 18546 });
  adapter = new XLayerAdapter();
  store = new SpaceStore();
  ctx = await start({ port: 0, store });
  founderAccount = privateKeyToAccount(generatePrivateKey());
  // The human founder signs in. The treasury agent below acts on a delegation
  // this same wallet signed, which is the whole onboarding shape.
  client = new SpaceClient(ctx.url, { cookie: await signIn(ctx.url, founderAccount) });
});

test.after(async () => {
  try { ctx.server.closeAllConnections?.(); ctx.server.close(); } catch { /* never started */ }
  if (chain) await chain.cleanup();
});

test('WIZARD: multi-agent onboarding settles REAL USDC, denials stay free', async () => {
  const D = chain.addrs.deployer;
  const P = chain.addrs.provider;

  // 1. Founder (human) creates + capitalizes the Space.
  const { space } = await client.createSpace({ name: 'Onboard Co', actorId: founderAccount.address, chainId: chain.chainId });
  const spaceId = space.id;
  const founderMember = (await client.getSpace(spaceId)).space.members[0].id;

  // 2. Multi-agent roster: provider + treasury operator, both key-backed
  // (member records carry wallet addresses; Space identity stays human-
  // readable while onchain calls resolve to keys).
  store.bindMemberAddress(spaceId, founderMember, founderAccount.address);
  await client.addParticipant(spaceId, { kind: 'Agent', displayName: 'ProviderBot', address: P });
  await client.addParticipant(spaceId, { kind: 'Agent', displayName: 'TreasuryOp', address: D });
  await client.fundSpace(spaceId, { amount: '5000.00', actorId: founderMember });

  // 2b. The founder's own wallet, and a delegation from it to the treasury
  // agent. An agent holds no authority of its own: without this signature the
  // escrow below is refused, which is the whole point of the onboarding path.
  const founderWallet = founderAccount;
  store.bindMemberAddress(spaceId, founderMember, founderWallet.address);
  const delegation = store.createDelegation({
    spaceId,
    delegationId: 'delegation-treasury-1',
    parentActor: founderWallet.address,
    child: D,
    parentRole: 'admin',
    childRole: 'agent',
    maxPerTransaction: '500.00',
    dailyBudget: '2000.00',
    allowedCounterparties: [P],
    asset: 'USDC',
    chainId: chain.chainId,
    nonce: '1',
    expiry: String(Math.floor(Date.now() / 1000) + 86400),
    policySnapshotHash: `0x${'0'.repeat(64)}`,
  });
  await store.signDelegation({
    spaceId,
    delegationId: 'delegation-treasury-1',
    parentActor: founderWallet.address,
    signature: await founderWallet.signTypedData(delegation.typedData),
  });

  // 3. Request: human asks, provider agent accepts.
  const { request } = await client.createRequest(spaceId, { createdBy: founderMember, title: 'Onboard GPU run' });
  assert.equal(request.status, 'Open');
  const accepted = await client.acceptRequest(spaceId, request.requestId, { actorId: 'ProviderBot' });
  assert.equal(accepted.request.status, 'Assigned');

  // 4. Work: escrow → deliver → evaluate → REAL settlement.
  const before = await adapter.balanceOf(P);
  const created = await client.createJob(spaceId, {
    actorId: 'TreasuryOp', provider: P, evaluator: 'TreasuryOp', delegationId: 'delegation-treasury-1',
    description: 'Wizard GPU job', budget: '5.00', deadline: F(), requestId: request.requestId,
  });
  assert.equal(created.status, 'Funded');

  await client.submitDeliverable(spaceId, created.job.jobId, {
    actorId: P, deliverableHash: `0x${'f'.repeat(64)}`, evidenceUri: 'ipfs://QmWizard001',
  });
  const done = await client.evaluateJob(spaceId, created.job.jobId, {
    evaluatorId: 'TreasuryOp', approved: true, feedback: 'Wizard verified live',
  });
  assert.equal(done.status, 'Completed');
  assert.ok(txOk(done.receipt.txHash));
  assert.ok(txOk(done.receipt.txHashes.complete));
  const after = await adapter.balanceOf(P);
  assert.equal(after - before, 5_000_000n, 'provider gained exactly 5 USDC onchain');

  // 5. Second request is blocked with reasons (denial path, zero chain cost).
  const balBeforeDeny = await adapter.balanceOf(P);
  const denied = await client.requestPayment(spaceId, { actorId: 'TreasuryOp', recipient: P, amount: '900.00', delegationId: 'delegation-treasury-1' })
    .then(() => null, (e) => e);
  assert.ok(denied instanceof PolicyDenial);
  assert.equal(await adapter.balanceOf(P), balBeforeDeny);

  // 6. Trace walks the whole chain with the real receipt.
  await client.completeRequest(spaceId, request.requestId, { actorId: 'ProviderBot', result: { output: 'GPUs delivered' } });
  const trace = await client.traceRequest(spaceId, request.requestId);
  assert.equal(trace.chain.request.requestId, request.requestId);
  assert.ok(txOk(trace.chain.payment.txHash));
  assert.ok(!('simulated' in trace.chain.payment));
});

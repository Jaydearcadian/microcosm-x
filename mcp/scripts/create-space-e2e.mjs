#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// The create-Space flow, end to end against the live chain.
//
// Every step here is the one the product's own flow performs: create the Space,
// add an agent and a counterparty, set limits, deposit into the Space's own
// pool, sign the limits the way the wallet does (a raw 32-byte signature over
// the digest the contract hands out), commit them on chain, and finally pay
// somebody. The point is the last step, which is the one that used to revert.
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http } from 'viem';
import { SpaceStore } from '../src/space-store.js';

const rpc = process.env.XLAYER_RPC_URL;
const client = createPublicClient({ transport: http(rpc) });

// A fresh Space, owned by a key we hold, so we can sign exactly as a wallet does.
const ownerKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const owner = privateKeyToAccount(ownerKey).address;
const agent = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const vendor = '0x1111111111111111111111111111111111111111';

const store = new SpaceStore({ seed: false });
const step = (n, msg) => console.log(`\n${n}. ${msg}`);
const ok = (msg) => console.log(`   PASS  ${msg}`);

const space = store.createSpace({ name: `E2E Flow ${Date.now()}`, actorId: owner });
step(1, `created ${space.id}`);

store.bindMemberAddress(space.id, owner, owner);
for (const person of [
  { kind: 'Agent', displayName: 'Buyer', address: agent },
  { kind: 'Counterparty', displayName: 'Vendor', address: vendor },
]) {
  store.addParticipant({ spaceId: space.id, kind: person.kind, displayName: person.displayName, address: person.address, actorId: owner });
}
const allow = store.getSpace(space.id).rules?.allowedCounterparties || [];
allow.includes(vendor.toLowerCase())
  ? ok(`counterparty added to the allowlist the owner will sign (${allow.length})`)
  : console.log(`   allowlist is ${JSON.stringify(allow)}`);

store.configureSpaceLimits({ spaceId: space.id, actorAddress: owner, maxPerTransaction: '500.00', dailyBudget: '2000.00' });
step(2, 'limits set: 500 per payment, 2000 daily');

const funded = await store.fundSpaceOnchain({ spaceId: space.id, amount: '500.00', actorId: owner });
step(3, `deposited 500 USDC into the Space's own pool`);
console.log(`   deposit tx  ${funded.onchain.depositTx}`);
ok(`ledger balance now ${funded.balance}`);

const prepared = await store.spaceBudgetBindingFor({
  spaceId: space.id, actorAddress: owner, maxPerTransaction: '500.00', dailyBudget: '2000.00',
});
step(4, 'owner signed the limits as EIP-712 typed data, the way a wallet does');
console.log(`   digest      ${prepared.digest}`);

// Signed the way the wallet now signs: EIP-712 typed data. Not signMessage
// (personal-sign prefix) and not signMessage({raw: digest}) (which re-hashes the
// bytes) — both produce a signature SpaceBudget's plain ecrecover will not
// recognise, and the failure names the signer rather than the encoding.
const signature = await privateKeyToAccount(ownerKey).signTypedData(prepared.typedData);

const bound = await store.bindSpaceBudget({
  spaceId: space.id, actorAddress: owner, signature, prepared,
});
step(5, 'limits committed on chain');
console.log(`   bind tx     ${bound.bindTx}`);
ok('registered the asset and committed the signed limits');

const { XLayerAdapter } = await import('../src/xlayer.js');
const adapter = new XLayerAdapter();
const poolBefore = await adapter.heldBalances([space.id]);
step(6, `paying 25 USDC to the vendor, out of the Space's own money`);
console.log(`   pool before ${poolBefore.perSpace[space.id]}`);

const paid = adapter.settleFromPoolOnchain({
  spaceId: space.id,
  paymentIdHash: `0x${'11'.repeat(32)}`,
  recipient: vendor,
  amount: '25.00',
});
console.log(`   payment tx  ${paid.txHash}`);

// Poll: the public node has served stale reads straight after a transaction.
let poolAfter = null;
for (let i = 0; i < 12; i += 1) {
  poolAfter = await adapter.heldBalances([space.id]);
  if (poolAfter.perSpace[space.id] !== poolBefore.perSpace[space.id]) break;
  await new Promise((r) => setTimeout(r, 2500));
}

step(7, 'after');
console.log(`   pool after  ${poolAfter.perSpace[space.id]}`);
console.log(`   totalAccounted ${poolAfter.totalAccounted}  router holds ${poolAfter.routerTokenBalance}`);

const checks = [
  ['the Space pool paid exactly 25 USDC', poolBefore.perSpace[space.id] - poolAfter.perSpace[space.id] === 25_000_000n],
  ['the Space is bound on chain', poolAfter.bound[space.id] === true],
  ['the router holds exactly what it owes', poolAfter.routerTokenBalance === poolAfter.totalAccounted],
  ['the Space is no longer stranded', poolAfter.bound[space.id] === true],
];
console.log('');
let allOk = true;
for (const [what, pass] of checks) { console.log(`   ${pass ? 'PASS' : 'FAIL'}  ${what}`); if (!pass) allOk = false; }

const report = await store.reconcileOnchainBalances({ spaceIds: [space.id] });
console.log(`\n   reconciliation: agrees=${report.agrees} ready=${report.readyToFundFromPool} stranded=${report.stranded.spaces.length}`);
process.exit(allOk ? 0 : 1);

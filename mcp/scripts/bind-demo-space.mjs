#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Bind and fund the existing production demo Space, without re-seeding.
//
// The seed now does this for a fresh Space, but the live service restores from a
// snapshot and never re-seeds, so the demo Space a visitor actually lands in is
// the old one — unbound, with a balance the chain held nothing for. Its money is
// stranded on the retired router, so this funds it again from the broadcaster.
//
// The signer is the demo owner's key, the same one the seed uses. A real Space
// owner would deposit from their own wallet and sign with their own key; the
// broadcaster is what this product already capitalises a Space with.
import { createPublicClient, createWalletClient, http, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256 } from 'viem';
import { SpaceStore } from '../src/space-store.js';
import { load } from '../../packages/server/src/persist.js';

const SNAPSHOT = process.argv[2] || '/var/lib/microcosm/microcosm-data.json';
const FOUNDER = 'Ava Founder';
const VENDOR = '0x1111111111111111111111111111111111111111';
const DEMO_SIGNER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const signer = privateKeyToAccount(DEMO_SIGNER_KEY);
const store = new SpaceStore({ seed: false });
load(store, SNAPSHOT);
const demoId = [...store.spaces.entries()].find(([, s]) => s.demo === true)?.[0];
if (!demoId) throw new Error(`no Space is marked as a demo in ${SNAPSHOT}`);
const space = store.getSpace(demoId);
console.log(`demo Space ${demoId} (${space.name})`);
console.log(`  ledger balance ${space.balance}`);

const { XLayerAdapter } = await import('../src/xlayer.js');
const adapter = new XLayerAdapter();

if ((await adapter.spaceBudgetBinding(demoId)).bound) {
  console.log('  already bound on chain');
} else {
  // Limits have to be at least as wide as the delegation the seed issued, or the
  // Space cannot mint the agent delegation its in-flight job depends on.
  const cap = '500.00';
  const daily = '1000.00';
  // The restored Space predates member wallet binding, so its admin has no
  // address and nothing that checks the caller's authority can match it. This is
  // the same binding a fresh seed performs.
  store.bindMemberAddress(demoId, FOUNDER, signer.address);
  // SpaceBudget refuses a binding with no approved recipients, and a Space that
  // can never pay anyone is not worth binding. The restored Space predates
  // participant addresses too, so its counterparty has none and the allowlist
  // the owner would be signing is empty. A fresh seed adds the vendor; this does
  // the same.
  const allow = (store.getSpace(demoId).rules?.allowedCounterparties || []).map((a) => String(a).toLowerCase());
  if (!allow.includes(VENDOR)) {
    // The counterparty already exists in the restored Space, so add one with a
    // different display name rather than colliding with it.
    store.addParticipant({ spaceId: demoId, kind: 'Counterparty', displayName: 'CloudCompute Corp (demo)', address: VENDOR, actorId: FOUNDER });
    console.log(`  added vendor ${VENDOR} to the approved allowlist`);
  }
  store.configureSpaceLimits({ spaceId: demoId, actorAddress: signer.address, maxPerTransaction: cap, dailyBudget: daily });
  const prepared = await store.spaceBudgetBindingFor({ spaceId: demoId, actorAddress: signer.address, maxPerTransaction: cap, dailyBudget: daily });
  const signature = await signer.signTypedData(prepared.typedData);
  const bound = await store.bindSpaceBudget({ spaceId: demoId, actorAddress: signer.address, signature, prepared });
  console.log(`  bound on chain   ${bound.bindTx}`);
}

// Deposit what the ledger claims, so the quote in the UI is a fact.
const claimed = Number(space.balance);
const held = Number((await adapter.heldBalances([demoId])).perSpace[demoId]) / 1e6;
if (claimed > held) {
  const short = (claimed - held).toFixed(6);
  const funded = await store.fundSpaceOnchain({ spaceId: demoId, amount: short, actorId: FOUNDER });
  console.log(`  deposited ${short}  ${funded.onchain.depositTx}`);
} else {
  console.log(`  already holds ${held} on chain`);
}

// The public node serves reads from a lagging backend, so a deposit that landed
// can still read back as absent, and reporting that as a failure sends whoever
// reads this looking for a problem that is not there. Poll until the chain
// agrees with itself before saying anything about it.
let after = await adapter.heldBalances([demoId]);
for (let i = 0; i < 12 && after.routerTokenBalance !== after.totalAccounted; i += 1) {
  await new Promise((r) => setTimeout(r, 2500));
  after = await adapter.heldBalances([demoId]);
}
console.log(`\n  chain holds ${after.perSpace[demoId]} base units, bound ${after.bound[demoId]}`);
const balances = after.routerTokenBalance === after.totalAccounted
  ? `router holds ${after.routerTokenBalance} = totalAccounted ${after.totalAccounted}`
  : `MISMATCH: router holds ${after.routerTokenBalance} but owes ${after.totalAccounted}`;
console.log(`  ${balances}`);
const report = await store.reconcileOnchainBalances({ spaceIds: [demoId] });
console.log(`  agrees ${report.agrees}  ready ${report.readyToFundFromPool}  stranded ${report.stranded.total}`);
if (!after.bound[demoId]) process.exit(1);

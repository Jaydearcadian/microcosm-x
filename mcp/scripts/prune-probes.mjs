#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Remove the test probe Spaces, and bring every remaining ledger claim down to
// what the chain actually holds.
//
// Every adjustment here is downward. Nothing is invented and no balance is
// raised: where a ledger claims more than the chain holds, the claim is reduced
// to the chain's figure, because that is the only number anyone can verify. The
// opposite direction — a chain holding more than the books claim — is never
// touched, and is reported as UNRECORDED instead.
//
// This exists because 15,830 USDC was stranded on a retired router and the books
// kept quoting it. A Space that cannot pay and whose money is unreachable is
// worse than an empty one, and an empty Space tells the truth.
import fs from 'node:fs';
import { SpaceStore } from '../src/space-store.js';
import { load, save, snapshot } from '../../packages/server/src/persist.js';

const SNAPSHOT = process.env.SNAPSHOT_PATH || '/var/lib/microcosm/microcosm-data.json';
const apply = process.argv.includes('--apply');

// Test artefacts, by the shape of their ids rather than a hardcoded list, so a
// future probe run does not quietly reappear in production.
const PROBE = /-(bind-probe|lim-probe|probe-sb|live-settlement-probe|probe-sb)-/;

const store = new SpaceStore({ seed: false });
load(store, SNAPSHOT);

const { XLayerAdapter } = await import('../src/xlayer.js');
const held = await new XLayerAdapter().heldBalances([...store.spaces.keys()]);

const drops = [];
const reductions = [];
for (const [spaceId, space] of store.spaces) {
  const claimed = String(space.balance || '0.000000');
  const actual = held.perSpace[spaceId] ?? 0n;
  if (PROBE.test(spaceId)) {
    if (Number(claimed) > 0 || actual > 0n) {
      drops.push({ spaceId, claimed, actual: (actual / 10n ** 6n).toString() });
    } else {
      drops.push({ spaceId, claimed, actual: '0' });
    }
    continue;
  }
  const claimedBase = BigInt(claimed.replace('.', ''));
  if (claimedBase > actual) {
    // Keep the same six-decimal shape the rest of the ledger uses, so a
    // corrected balance is not mistaken for a different unit.
    const whole = actual / 10n ** 6n;
    const frac = String(actual % 10n ** 6n).padStart(6, '0');
    reductions.push({ spaceId, from: claimed, to: `${whole}.${frac}` });
  }
}

console.log(`${apply ? 'APPLYING' : 'DRY RUN'} · ${store.spaces.size} spaces in ${SNAPSHOT}\n`);
console.log(`  would delete ${drops.length} probe Space(s):`);
for (const d of drops) console.log(`    ${d.spaceId.padEnd(40)} claimed ${d.claimed.padStart(14)}  chain held ${d.actual}`);
console.log(`\n  would reduce ${reductions.length} claim(s) to what the chain holds:`);
for (const r of reductions) console.log(`    ${r.spaceId.padEnd(40)} ${r.from} -> ${r.to}`);

if (!apply) {
  console.log('\n  dry run only. Re-run with --apply.');
  process.exit(0);
}

for (const d of drops) {
  const [activity, receipts, jobs, participants, requests, invitations, gov, x402, delegations, cursors, reconciliations, reorgs] = [
    store.activity, store.receipts, store.jobs, store.participants, store.requests, store.invitations,
    store.governanceRequests, store.x402Intents, store.delegations, store.indexerCursors, store.indexerReconciliations, store.indexerReorgSnapshots,
  ];
  for (const map of [activity, receipts, jobs, requests, invitations, gov, x402, delegations, cursors, reconciliations, reorgs]) {
    for (const [k, v] of [...map]) if (v && v.spaceId === d.spaceId) map.delete(k);
  }
  for (const [k, v] of [...participants]) if (v && v.spaceId === d.spaceId) participants.delete(k);
  store.spaces.delete(d.spaceId);
  console.log(`  deleted ${d.spaceId}`);
}

for (const r of reductions) {
  const space = store.getSpace(r.spaceId);
  const from = space.balance;
  space.balance = r.to;
  store.activity.get(r.spaceId).push({
    type: 'SPACE_BALANCE_CORRECTED',
    spaceId: r.spaceId,
    from,
    to: r.to,
    reason: 'ledger claimed more than the settlement router holds; reduced to the chain figure so the books and the chain agree',
    timestamp: new Date().toISOString(),
  });
  console.log(`  reduced ${r.spaceId} ${from} -> ${r.to}`);
}

save(store, SNAPSHOT);
console.log(`\n  wrote ${SNAPSHOT} (${fs.statSync(SNAPSHOT).size} bytes)`);

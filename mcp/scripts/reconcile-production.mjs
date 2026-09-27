#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Reconcile the *production* ledger, not a freshly seeded one.
//
// The first reconciliation after the migration was run against a store built by
// the seed, which contains a single Space. Production has nine. Reporting the
// seeded store's green result as though it described the deployment would have
// been the most misleading thing in this whole change, so this reads the same
// snapshot file the service boots from.
import fs from 'node:fs';
import { SpaceStore } from '../src/space-store.js';

const file = process.argv[2] || '/var/lib/microcosm/microcosm-data.json';
if (!fs.existsSync(file)) {
  console.error(`no snapshot at ${file}`);
  process.exit(1);
}
const { load } = await import('../../packages/server/src/persist.js');
const store = new SpaceStore({ seed: false });
load(store, file);

const report = await store.reconcileOnchainBalances();
console.log(`snapshot: ${file}`);
console.log(`spaces with a balance: ${report.perSpace.length}\n`);
for (const row of report.perSpace) {
  console.log(`  ${row.state.padEnd(11)} ${row.spaceId}`);
  console.log(`      claimed ${row.claimed.padStart(14)}   held ${row.heldOnChain.padStart(14)}`);
}
console.log(`\n  claimTotal   ${report.summary.claimTotal}`);
console.log(`  heldTotal    ${report.summary.heldTotal}`);
console.log(`  unbacked     ${report.summary.unbacked}`);
console.log(`  chainBalances ${report.chainBalances}  agrees ${report.agrees}  ready ${report.readyToFundFromPool}`);
process.exit(report.agrees ? 0 : 1);

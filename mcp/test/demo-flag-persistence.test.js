/**
 * A snapshot that predates the demo flag must not dead-end the entry gate.
 *
 * This is a regression test for a live outage. The production snapshot had been
 * written by a build from before `demo` existed, so after an ordinary restart
 * every Space came back without the field. Nothing threw: a missing flag and a
 * false one are the same value to everything downstream, the API reported
 * `demo: false` for all nine Spaces, and the entry gate — which offers a demo
 * Space to anyone who is not already a member — had nothing left to offer. New
 * visitors got "nothing to show yet" and no way in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpaceStore } from '../src/space-store.js';
import { snapshot, load, save, SNAPSHOT_VERSION } from '../../packages/server/src/persist.js';

const DEMO_LEGACY_ID = 'space-acme-procurement-42ee';

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'persist-')), name);
}

/** Writes a snapshot shaped like one written before the demo flag existed. */
function writeLegacySnapshot(file) {
  fs.writeFileSync(file, JSON.stringify({
    version: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    // The real file stored Spaces as [id, space] pairs, and no Space had `demo`.
    spaces: [[DEMO_LEGACY_ID, { id: DEMO_LEGACY_ID, name: 'Acme Procurement', balance: '5000.00' }]],
    activity: [], receipts: [], jobs: [], participants: [], requests: [],
  }));
}

test('D-1: a snapshot with no demo field still restores an openable demo Space', () => {
  const file = tmpFile('legacy.json');
  writeLegacySnapshot(file);

  const store = new SpaceStore({ seed: false });
  assert.equal(load(store, file), true, 'the snapshot should load');
  assert.equal(store.spaces.get(DEMO_LEGACY_ID).demo, true,
    'the seeded demo Space must be flagged again, or the gate has nothing to offer');

  // The gate's own rule: demo and unaffiliated. If this is empty the gate is a
  // dead end, which is the failure this test exists to prevent.
  const offerable = [...store.spaces.values()].filter((s) => s.demo === true);
  assert.equal(offerable.length, 1, 'exactly the seeded demo should be offered');
});

test('D-2: a current snapshot round-trips its own demo flag untouched', () => {
  const store = new SpaceStore({ seed: false });
  const space = store.createSpace({ name: 'Marked', actorId: '0x' + '11'.repeat(20) });
  store.markSpaceAsDemo(space.id, 'acme-procurement');

  const file = tmpFile('current.json');
  save(store, file);

  const reloaded = new SpaceStore({ seed: false });
  load(reloaded, file);
  assert.equal(reloaded.spaces.get(space.id).demo, true);
  assert.equal(reloaded.spaces.get(space.id).seedKey, 'acme-procurement');
});

test('D-3: the repair never clears a flag, and never flags an unrelated Space', () => {
  const file = tmpFile('mixed.json');
  const plain = { id: 'space-procurement-001', name: 'Procurement', demo: false };
  const manual = { id: 'space-manual-777', name: 'Hand marked', demo: true };
  fs.writeFileSync(file, JSON.stringify({
    version: SNAPSHOT_VERSION, savedAt: new Date().toISOString(),
    spaces: [[DEMO_LEGACY_ID, { id: DEMO_LEGACY_ID, name: 'Acme Procurement' }], ['space-procurement-001', plain], ['space-manual-777', manual]],
    activity: [], receipts: [], jobs: [], participants: [], requests: [],
  }));

  const store = new SpaceStore({ seed: false });
  load(store, file);

  assert.equal(store.spaces.get(DEMO_LEGACY_ID).demo, true, 'the legacy demo is repaired');
  assert.equal(store.spaces.get('space-procurement-001').demo, false,
    'a Space that was not a demo must not become one just because it was restored');
  assert.equal(store.spaces.get('space-manual-777').demo, true, 'an existing flag is left alone');
});

test('D-4: snapshot() records the flag, so the next save is not the problem', () => {
  const store = new SpaceStore({ seed: false });
  const space = store.createSpace({ name: 'Marked', actorId: '0x' + '11'.repeat(20) });
  store.markSpaceAsDemo(space.id, 'acme-procurement');
  const saved = JSON.parse(JSON.stringify(snapshot(store)));
  const entry = saved.spaces.find(([id]) => id === space.id)[1];
  assert.equal(entry.demo, true);
  assert.equal(entry.seedKey, 'acme-procurement');
});

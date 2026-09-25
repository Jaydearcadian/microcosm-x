/**
 * M4 persistence: atomic JSON snapshot driver for SpaceStore.
 *
 * Zero dependencies, kilobytes on disk. Every mutation snapshots the full
 * store (spaces, participants, requests, jobs, receipts, activity +
 * ID counters) via write-tmp-then-rename, so a crash mid-write can never
 * leave a half-state file behind. Corrupt snapshots fail loud at boot —
 * a money system must never boot into guessed state.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SNAPSHOT_VERSION = 1;

export function snapshot(store) {
  return {
    version: SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    spaces: [...store.spaces.entries()],
    activity: [...store.activity.entries()],
    receipts: [...store.receipts.entries()],
    jobs: [...store.jobs.entries()],
    participants: [...store.participants.entries()],
    requests: [...store.requests.entries()],
    invitations: [...store.invitations.entries()],
    governanceRequests: [...store.governanceRequests.entries()],
    x402Intents: [...store.x402Intents.entries()],
    indexerCursors: [...store.indexerCursors.entries()],
    indexerReconciliations: [...store.indexerReconciliations.entries()],
    indexerReorgSnapshots: [...store.indexerReorgSnapshots.entries()],
    counters: {
      job: store._nextJobSeq,
      participant: store._nextParticipantSeq,
      request: store._nextRequestSeq,
      invite: store._nextInviteSeq,
      governanceRequest: store._nextGovernanceRequestSeq,
      x402Intent: store._nextX402IntentSeq,
    },
  };
}

export function save(store, filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot(store)));
  fs.renameSync(tmp, filePath);
  return filePath;
}

export function load(store, filePath) {
  if (!fs.existsSync(filePath)) return false;
  const raw = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Persistence snapshot at '${filePath}' is corrupt (unparseable JSON) — refusing to boot`);
  }
  if (!data || data.version !== SNAPSHOT_VERSION || !Array.isArray(data.spaces)) {
    throw new Error(`Persistence snapshot at '${filePath}' has unsupported shape — refusing to boot`);
  }
  store.spaces = new Map(data.spaces);
  store.activity = new Map(data.activity || []);
  store.receipts = new Map(data.receipts || []);
  store.jobs = new Map(data.jobs || []);
  store.participants = new Map(data.participants || []);
  store.requests = new Map(data.requests || []);
  store.invitations = new Map(data.invitations || []);
  store.governanceRequests = new Map(data.governanceRequests || []);
  store.governanceExecutionClaims = new Set();
  store.x402Intents = new Map(data.x402Intents || []);
  store.x402ExecutionClaims = new Set();
  store.indexerCursors = new Map(data.indexerCursors || []);
  store.indexerReconciliations = new Map(data.indexerReconciliations || []);
  store.indexerReorgSnapshots = new Map(data.indexerReorgSnapshots || []);
  store._nextJobSeq = data.counters?.job ?? 1;
  store._nextParticipantSeq = data.counters?.participant ?? 1;
  store._nextRequestSeq = data.counters?.request ?? 1;
  store._nextInviteSeq = data.counters?.invite ?? 1;
  store._nextGovernanceRequestSeq = data.counters?.governanceRequest ?? 1;
  store._nextX402IntentSeq = data.counters?.x402Intent ?? 1;
  return true;
}

export function describe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stat = fs.statSync(filePath);
  return { path: filePath, bytes: stat.size, modifiedAt: stat.mtime.toISOString() };
}

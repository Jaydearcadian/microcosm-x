/**
 * Demo seed (M3): boots a populated Space so the UI agent always opens a
 * living app, never an empty state. Slice-10 loop, frozen mid-flight:
 * founder + agent + counterparty, funded treasury, one request accepted,
 * one escrowed job with submitted proof, one denial.
 *
 * Deliberately NO settled payment: settlement is always a real onchain
 * transfer, and seed fabricates nothing. Run scripts/demo-procurement-space.mjs
 * (live, needs a key) for the full loop through real settlement.
 */

import { SpaceStore } from '../../../mcp/src/space-store.js';

const VENDOR = '0x1111111111111111111111111111111111111111';

function futureDeadline(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function buildDemoSpace(store = new SpaceStore()) {
  const founder = 'Ava Founder';
  const agent = 'ProcureBot';
  const vendor = 'CloudCompute Corp';

  const space = store.createSpace({
    name: 'Acme Procurement',
    description: 'Seeded demo Space: bounded buying with agents.',
    actorId: founder,
  });
  const spaceId = space.id;

  store.addParticipant({ spaceId, kind: 'Agent', displayName: agent, address: '0x2222222222222222222222222222222222222222', actorId: founder });
  store.addParticipant({ spaceId, kind: 'Counterparty', displayName: vendor, address: VENDOR, actorId: founder });

  store.fundSpace({ spaceId, amount: '5000.00', actorId: founder });

  const request = store.createRequest({
    spaceId,
    createdBy: founder,
    title: 'Provision 100 GPU-hours for the render queue',
    instructions: 'Settle only against a submitted deliverable hash.',
    context: { priority: 'high', queue: 'render-7' },
  });
  store.acceptRequest({ spaceId, requestId: request.requestId, actorId: agent });

  const created = store.createJob({
    spaceId,
    actorId: agent,
    provider: VENDOR,
    evaluator: founder,
    description: 'GPU cluster allocation (Invoice #CC-9021)',
    budget: '350.00',
    deadline: futureDeadline(),
    requestId: request.requestId,
  });
  const jobId = created.job.jobId;
  store.submitDeliverable({
    spaceId,
    jobId,
    actorId: VENDOR,
    deliverableHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    evidenceUri: 'ipfs://QmGpuClusterEvidence9021',
  });

  // No settled payment here — settlement is always real onchain value and
  // seed fabricates no receipts. The over-cap denial below is chain-free.
  const denied = await store.requestPayment({
    spaceId,
    actorId: agent,
    recipient: VENDOR,
    amount: '9000.00',
    memo: 'Seeded over-cap attempt (must deny)',
  });

  return {
    spaceId,
    spaceName: space.name,
    treasury: store.getSpace(spaceId).balance,
    founder,
    agent,
    vendor,
    requestId: request.requestId,
    requestStatus: store.getRequest({ spaceId, requestId: request.requestId }).status,
    jobId,
    jobStatus: store.getJob({ spaceId, jobId }).status,
    settledReceipt: null,
    liveTopUp: false,
    denialRecorded: denied.status === 'REJECTED',
  };
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const summary = await buildDemoSpace();
  console.log(JSON.stringify(summary, null, 2));
}

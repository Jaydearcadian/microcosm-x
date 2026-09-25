import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceStore } from '../src/space-store.js';
import { handleToolCall, TOOL_DEFINITIONS } from '../src/tools.js';

test('MCP-TOOLS: Tool definitions list 33 Space operations (core + Work lifecycle + court verdicts + participants + requests + governance + M14 read-only validation)', () => {
  assert.equal(TOOL_DEFINITIONS.length, 33);
  const toolNames = TOOL_DEFINITIONS.map((t) => t.name);
  assert.ok(toolNames.includes('spaces_list'));
  assert.ok(toolNames.includes('spaces_capabilities'));
  assert.ok(toolNames.includes('payments_request'));
  assert.ok(toolNames.includes('activity_list'));
  assert.ok(toolNames.includes('work_create'));
  assert.ok(toolNames.includes('work_submit'));
  assert.ok(toolNames.includes('work_evaluate'));
  assert.ok(toolNames.includes('work_get'));
  assert.ok(toolNames.includes('work_request_verdict'));
  assert.ok(toolNames.includes('work_post_verdict'));
});

test('MCP-1: Agent can discover Space capabilities and policy rules', async () => {
  const store = new SpaceStore();
  const res = await handleToolCall(store, 'spaces_capabilities', {
    spaceId: 'space-procurement-001',
    actorId: 'agent-procure-01',
  });

  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.spaceId, 'space-procurement-001');
  assert.equal(data.currency, 'USDC');
  assert.equal(data.treasuryBalance, '5000.00');
  assert.equal(data.rules.maxPerTransaction, '500.00');
  assert.equal(data.rules.dailyBudget, '2000.00');
  assert.ok(data.rules.allowedCounterparties.includes('0x1111111111111111111111111111111111111111'));
});

test('MCP-3: Agent requests non-compliant payment ($900 > $500) -> isError true with DenialProof', async () => {
  const store = new SpaceStore();
  const res = await handleToolCall(store, 'payments_request', {
    spaceId: 'space-procurement-001',
    actorId: 'agent-procure-01',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '900.00', // Exceeds $500 cap
    memo: 'Unauthorized workstation purchase',
  });

  assert.equal(res.isError, true);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.status, 'REJECTED');
  assert.ok(data.reasons.some((r) => r.includes('Exceeds Space per-transaction cap')));
  assert.ok(data.denialProof);
  assert.equal(data.denialProof.requestedAmount, '900.00');
  assert.ok(data.denialProof.proofHash.startsWith('0x'));

  // Ensure balance is unaffected
  const space = store.getSpace('space-procurement-001');
  assert.equal(space.balance, '5000.00');
});

// NOTE: settled-payment success legs live in live-settlement.test.js
// (LIVE-1…LIVE-6) — every success path moves REAL value on a REAL EVM.
// This file keeps the offline-provable paths: denials, validation, escrow,
// expiry, proof-gating, rejections, and state machine negatives.

// --- First-class Work lifecycle & Gaia exception handling -------------------

const WORK_SPACE = 'space-procurement-001';
const WORK_CLIENT = 'agent-procure-01';
const WORK_VENDOR = '0x1111111111111111111111111111111111111111';
const WORK_EVALUATOR = 'admin-01';

function futureDeadline(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

test('WORK-1: work_create escrows funds from Space balance (Open -> Funded)', async () => {
  const store = new SpaceStore();
  const res = await handleToolCall(store, 'work_create', {
    spaceId: WORK_SPACE,
    actorId: WORK_CLIENT,
    provider: WORK_VENDOR,
    evaluator: WORK_EVALUATOR,
    description: 'GPU cluster allocation (Invoice #CC-9021)',
    budget: '350.00',
    deadline: futureDeadline(),
  });

  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.status, 'Funded');
  assert.ok(data.job);
  assert.equal(data.job.status, 'Funded');
  assert.equal(data.job.provider, WORK_VENDOR);
  assert.equal(data.job.evaluator, WORK_EVALUATOR);
  assert.equal(data.job.escrowedAmount, '350.000000');
  // $5,000 - $350 escrowed = $4,650 held out of spendable balance
  assert.equal(data.remainingBalance, '4650.000000');
  assert.equal(store.getSpace(WORK_SPACE).balance, '4650.000000');
});

test('WORK-2: provider submits deliverable hash (Funded -> Submitted)', async () => {
  const store = new SpaceStore();
  const created = JSON.parse(
    (
      await handleToolCall(store, 'work_create', {
        spaceId: WORK_SPACE,
        actorId: WORK_CLIENT,
        provider: WORK_VENDOR,
        evaluator: WORK_EVALUATOR,
        description: 'Dataset delivery Q3',
        budget: '200.00',
        deadline: futureDeadline(),
      })
    ).content[0].text
  );

  const res = await handleToolCall(store, 'work_submit', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    actorId: WORK_VENDOR,
    deliverableHash: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    evidenceUri: 'ipfs://QmWorkEvidence001',
  });

  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.status, 'Submitted');
  assert.equal(data.job.status, 'Submitted');
  assert.equal(
    data.job.deliverableHash,
    '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
  );
});

test('WORK-4 (negative): evaluator rejects -> Rejected, Gaia exception refunds Space treasury ($0 lost)', async () => {
  const store = new SpaceStore();
  const created = JSON.parse(
    (
      await handleToolCall(store, 'work_create', {
        spaceId: WORK_SPACE,
        actorId: WORK_CLIENT,
        provider: WORK_VENDOR,
        evaluator: WORK_EVALUATOR,
        description: 'Dataset delivery (low quality)',
        budget: '200.00',
        deadline: futureDeadline(),
      })
    ).content[0].text
  );
  assert.equal(store.getSpace(WORK_SPACE).balance, '4800.000000');

  await handleToolCall(store, 'work_submit', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    actorId: WORK_VENDOR,
    deliverableHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });

  const res = await handleToolCall(store, 'work_evaluate', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    evaluatorId: WORK_EVALUATOR,
    approved: false,
    feedback: 'Quality below acceptance threshold',
  });

  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.status, 'Rejected');
  assert.equal(data.job.status, 'Rejected');
  // Gaia exception: 100% of escrow returned
  assert.equal(data.gaiaRefund, '200.000000');
  assert.equal(data.spaceBalance, '5000.000000');
  assert.equal(store.getSpace(WORK_SPACE).balance, '5000.000000');
});

test('WORK-5: expired Work Order triggers Gaia claimRefund (Funded/Submitted -> Expired)', async () => {
  const store = new SpaceStore();
  const created = JSON.parse(
    (
      await handleToolCall(store, 'work_create', {
        spaceId: WORK_SPACE,
        actorId: WORK_CLIENT,
        provider: WORK_VENDOR,
        evaluator: WORK_EVALUATOR,
        description: 'Short-fuse task',
        budget: '100.00',
        deadline: new Date(Date.now() + 50).toISOString(),
      })
    ).content[0].text
  );
  assert.equal(store.getSpace(WORK_SPACE).balance, '4900.000000');

  // Let the deadline lapse, then read — lazy expiry applies the Gaia refund.
  await new Promise((r) => setTimeout(r, 80));
  const fetched = JSON.parse(
    (await handleToolCall(store, 'work_get', { spaceId: WORK_SPACE, jobId: created.job.jobId }))
      .content[0].text
  );
  assert.equal(fetched.job.status, 'Expired');
  assert.equal(store.getSpace(WORK_SPACE).balance, '5000.000000');
});

test('WORK-6 (negative): money never moves without verifiable deliverable proof', async () => {
  const store = new SpaceStore();
  const created = JSON.parse(
    (
      await handleToolCall(store, 'work_create', {
        spaceId: WORK_SPACE,
        actorId: WORK_CLIENT,
        provider: WORK_VENDOR,
        evaluator: WORK_EVALUATOR,
        description: 'Proof-less payout attempt',
        budget: '150.00',
        deadline: futureDeadline(),
      })
    ).content[0].text
  );

  // Approve without any deliverable submission must fail.
  const res = await handleToolCall(store, 'work_evaluate', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    evaluatorId: WORK_EVALUATOR,
    approved: true,
    feedback: 'Skipping proof',
  });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /Submitted|proof/i);

  // Non-provider cannot submit proof.
  const badSubmit = await handleToolCall(store, 'work_submit', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    actorId: 'attacker-99',
    deliverableHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  });
  assert.equal(badSubmit.isError, true);

  // Over-cap Work Order is policy-rejected at creation (no escrow moves).
  const overCap = await handleToolCall(store, 'work_create', {
    spaceId: WORK_SPACE,
    actorId: WORK_CLIENT,
    provider: WORK_VENDOR,
    evaluator: WORK_EVALUATOR,
    description: 'Over-limit work',
    budget: '900.00',
    deadline: futureDeadline(),
  });
  assert.equal(overCap.isError, true);
  const denied = JSON.parse(overCap.content[0].text);
  assert.equal(denied.status, 'REJECTED');
  assert.ok(denied.denialProof);
});

test('WORK-7 (regression): concurrent escrows cannot breach the daily budget; refunds restore headroom', async () => {
  const store = new SpaceStore();
  const S = WORK_SPACE;
  const d = futureDeadline();

  // $490 x 5 = $2,450 committed, but the daily budget is only $2,000. The
  // daily check must count outstanding escrows, so the 5th job must be denied.
  for (let i = 0; i < 4; i++) {
    const r = await handleToolCall(store, 'work_create', {
      spaceId: S,
      actorId: WORK_CLIENT,
      provider: WORK_VENDOR,
      evaluator: WORK_EVALUATOR,
      description: `Concurrent job ${i}`,
      budget: '490.00',
      deadline: d,
    });
    assert.equal(r.isError, undefined, `job ${i} should escrow fine`);
  }
  assert.equal(store.getSpace(S).totalSpentToday, '1960.000000');

  const fifth = await handleToolCall(store, 'work_create', {
    spaceId: S,
    actorId: WORK_CLIENT,
    provider: WORK_VENDOR,
    evaluator: WORK_EVALUATOR,
    description: 'Budget-breaching job',
    budget: '490.00',
    deadline: d,
  });
  assert.equal(fifth.isError, true);
  const deniedDaily = JSON.parse(fifth.content[0].text);
  assert.equal(deniedDaily.status, 'REJECTED');
  assert.ok(deniedDaily.reasons.some((x) => x.includes('daily budget')));

  // Gaia refund on rejection restores daily headroom ($0 lost, $0 stranded).
  const firstJobId = store.getActivity(S).find((a) => a.type === 'WORK_CREATED').jobId;
  await handleToolCall(store, 'work_submit', {
    spaceId: S,
    jobId: firstJobId,
    actorId: WORK_VENDOR,
    deliverableHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  });
  await handleToolCall(store, 'work_evaluate', {
    spaceId: S,
    jobId: firstJobId,
    evaluatorId: WORK_EVALUATOR,
    approved: false,
    feedback: 'Rejected to restore headroom',
  });
  assert.equal(store.getSpace(S).balance, '3530.000000'); // $490 refunded in full (5000 - 4*490 + 490)
  assert.equal(store.getSpace(S).totalSpentToday, '1470.000000'); // headroom restored

  // With headroom restored, a new $490 escrow is now allowed.
  const retry = await handleToolCall(store, 'work_create', {
    spaceId: S,
    actorId: WORK_CLIENT,
    provider: WORK_VENDOR,
    evaluator: WORK_EVALUATOR,
    description: 'Retry within restored headroom',
    budget: '490.00',
    deadline: d,
  });
  assert.equal(retry.isError, undefined);
  const retryData = JSON.parse(retry.content[0].text);
  assert.equal(retryData.status, 'Funded');
});

test('WORK-9 (negative): court rejection refunds in full; impostor verdicts fail', async () => {
  const store = new SpaceStore();
  const COURT = 'court-genlayer-01';

  const created = JSON.parse(
    (
      await handleToolCall(store, 'work_create', {
        spaceId: WORK_SPACE,
        actorId: WORK_CLIENT,
        provider: WORK_VENDOR,
        evaluator: WORK_EVALUATOR,
        adjudicator: COURT,
        rubricHash: '0x' + '3'.repeat(64),
        description: 'Court-gated dataset delivery',
        budget: '200.00',
        deadline: futureDeadline(),
      })
    ).content[0].text
  );
  await handleToolCall(store, 'work_submit', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    actorId: WORK_VENDOR,
    deliverableHash: '0x' + '4'.repeat(64),
  });
  await handleToolCall(store, 'work_request_verdict', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    actorId: WORK_VENDOR,
  });

  // An impostor court cannot post verdicts.
  const impostor = await handleToolCall(store, 'work_post_verdict', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    adjudicatorId: 'attacker-court',
    approved: true,
  });
  assert.equal(impostor.isError, true);
  assert.equal(store.getSpace(WORK_SPACE).balance, '4800.000000');

  // The bound court rejects: 100% Gaia refund, $0 lost.
  const verdict = JSON.parse(
    (
      await handleToolCall(store, 'work_post_verdict', {
        spaceId: WORK_SPACE,
        jobId: created.job.jobId,
        adjudicatorId: COURT,
        approved: false,
        reason: 'Dataset fails rubric acceptance checks',
      })
    ).content[0].text
  );
  assert.equal(verdict.status, 'Rejected');
  assert.equal(verdict.gaiaRefund, '200.000000');
  assert.equal(verdict.spaceBalance, '5000.000000');
  assert.equal(store.getSpace(WORK_SPACE).balance, '5000.000000');

  // Referral before any deliverable proof fails (nothing to judge).
  const early = JSON.parse(
    (
      await handleToolCall(store, 'work_create', {
        spaceId: WORK_SPACE,
        actorId: WORK_CLIENT,
        provider: WORK_VENDOR,
        evaluator: WORK_EVALUATOR,
        adjudicator: COURT,
        description: 'Proof-less referral attempt',
        budget: '100.00',
        deadline: futureDeadline(),
      })
    ).content[0].text
  );
  const noProof = await handleToolCall(store, 'work_request_verdict', {
    spaceId: WORK_SPACE,
    jobId: early.job.jobId,
    actorId: WORK_CLIENT,
  });
  assert.equal(noProof.isError, true);
});

// ---------------------------------------------------------------------------
// Participants (rebaseline §6): agents are ordinary Space participants

const PARTICIPANT_SPACE = 'space-procurement-001';

test('PART-1: admin adds a Human and an external Counterparty participant to a Space', async () => {
  const store = new SpaceStore();
  const human = JSON.parse(
    (
      await handleToolCall(store, 'participants_add', {
        spaceId: PARTICIPANT_SPACE,
        kind: 'Human',
        displayName: 'Finance Lead',
        actorId: 'admin-01',
      })
    ).content[0].text
  ).participant;
  assert.ok(human.participantId.startsWith('part-'));
  assert.equal(human.kind, 'Human');
  assert.equal(human.status, 'Active');

  const counterparty = JSON.parse(
    (
      await handleToolCall(store, 'participants_add', {
        spaceId: PARTICIPANT_SPACE,
        kind: 'Counterparty',
        displayName: 'Dataset Provider Ltd',
        address: '0x2222222222222222222222222222222222222222',
        externalRef: 'crm:suppliers/4417',
      })
    ).content[0].text
  ).participant;
  assert.equal(counterparty.address, '0x2222222222222222222222222222222222222222');
  assert.equal(counterparty.externalRef, 'crm:suppliers/4417');

  const listed = JSON.parse(
    (await handleToolCall(store, 'participants_list', { spaceId: PARTICIPANT_SPACE })).content[0].text
  ).participants;
  assert.ok(listed.length >= 4, 'seed participants plus the two additions');
  assert.ok(listed.some((p) => p.displayName === 'Finance Lead'));
  assert.ok(listed.some((p) => p.externalRef === 'crm:suppliers/4417'));
});

test('PART-2 (negative): duplicate active name and unknown kind are rejected', async () => {
  const store = new SpaceStore();
  await handleToolCall(store, 'participants_add', {
    spaceId: PARTICIPANT_SPACE, kind: 'Human', displayName: 'Finance Lead',
  });
  const dup = await handleToolCall(store, 'participants_add', {
    spaceId: PARTICIPANT_SPACE, kind: 'Agent', displayName: 'finance lead',
  });
  assert.equal(dup.isError, true);
  assert.match(dup.content[0].text, /already active/);

  const badKind = await handleToolCall(store, 'participants_add', {
    spaceId: PARTICIPANT_SPACE, kind: 'SuperAgent', displayName: 'X',
  });
  assert.equal(badKind.isError, true);
  assert.match(badKind.content[0].text, /Invalid participant kind/);
});

test('PART-3: deactivation is audit-recorded, not erased', async () => {
  const store = new SpaceStore();
  const added = JSON.parse(
    (
      await handleToolCall(store, 'participants_add', {
        spaceId: PARTICIPANT_SPACE, kind: 'Service', displayName: 'Invoice OCR',
      })
    ).content[0].text
  ).participant;

  const off = JSON.parse(
    (
      await handleToolCall(store, 'participants_deactivate', {
        spaceId: PARTICIPANT_SPACE, participantId: added.participantId, actorId: 'admin-01',
      })
    ).content[0].text
  ).participant;
  assert.equal(off.status, 'Inactive');

  const active = JSON.parse(
    (
      await handleToolCall(store, 'participants_list', { spaceId: PARTICIPANT_SPACE, status: 'Active' })
    ).content[0].text
  ).participants;
  assert.ok(!active.some((p) => p.participantId === added.participantId));

  const activity = store.getActivity(PARTICIPANT_SPACE);
  assert.ok(activity.some((a) => a.type === 'PARTICIPANT_ADDED' && a.participantId === added.participantId));
  assert.ok(activity.some((a) => a.type === 'PARTICIPANT_REMOVED' && a.participantId === added.participantId));

  const reOff = await handleToolCall(store, 'participants_deactivate', {
    spaceId: PARTICIPANT_SPACE, participantId: added.participantId,
  });
  assert.equal(reOff.isError, true);
  assert.match(reOff.content[0].text, /already Inactive/);
});

// ---------------------------------------------------------------------------
// Requests (rebaseline §8, §17 Slice 3): the first-class product object

test('REQ-1: create, assign, and complete a Request with a Result (full product loop)', async () => {
  const store = new SpaceStore();
  const request = JSON.parse(
    (
      await handleToolCall(store, 'requests_create', {
        spaceId: PARTICIPANT_SPACE,
        createdBy: 'Treasury Admin',
        assignee: 'Autonomous Procurement Agent',
        title: 'Review these invoices and flag anything unusual',
        instructions: 'Compare against last quarter. Flag anything above $250.',
        context: { files: ['invoices-q3.csv'], expected: 'list of anomalies' },
      })
    ).content[0].text
  ).request;
  assert.ok(request.requestId.startsWith('req-'));
  assert.equal(request.status, 'Assigned');
  assert.equal(request.createdBy, 'part-0001');
  assert.ok(request.assignee.startsWith('part-'));

  const done = JSON.parse(
    (
      await handleToolCall(store, 'requests_complete', {
        spaceId: PARTICIPANT_SPACE,
        requestId: request.requestId,
        actorId: 'Autonomous Procurement Agent',
        result: { output: '2 anomalies flagged', evidence: ['inv-0091', 'inv-0233'] },
      })
    ).content[0].text
  ).request;
  assert.equal(done.status, 'Completed');
  assert.equal(done.result.output, '2 anomalies flagged');
  assert.ok(done.completedAt);

  const got = JSON.parse(
    (
      await handleToolCall(store, 'requests_get', {
        spaceId: PARTICIPANT_SPACE, requestId: request.requestId,
      })
    ).content[0].text
  ).request;
  assert.equal(got.status, 'Completed');
  assert.ok(got.completedAt);

  const activity = store.getActivity(PARTICIPANT_SPACE);
  assert.ok(activity.some((a) => a.type === 'REQUEST_CREATED' && a.requestId === request.requestId));
  assert.ok(activity.some((a) => a.type === 'REQUEST_COMPLETED' && a.requestId === request.requestId));
});

test('REQ-2: unassigned Request can be accepted by an active participant', async () => {
  const store = new SpaceStore();
  const created = JSON.parse(
    (
      await handleToolCall(store, 'requests_create', {
        spaceId: PARTICIPANT_SPACE,
        createdBy: 'Treasury Admin',
        title: 'Check whether this document satisfies the contract',
      })
    ).content[0].text
  ).request;
  assert.equal(created.status, 'Open');
  assert.equal(created.assignee, null);

  const accepted = JSON.parse(
    (
      await handleToolCall(store, 'requests_accept', {
        spaceId: PARTICIPANT_SPACE, requestId: created.requestId, actorId: 'Autonomous Procurement Agent',
      })
    ).content[0].text
  ).request;
  assert.equal(accepted.status, 'Assigned');
  assert.ok(accepted.assignee.startsWith('part-'));

  const listed = JSON.parse(
    (
      await handleToolCall(store, 'requests_list', {
        spaceId: PARTICIPANT_SPACE, status: 'Assigned',
      })
    ).content[0].text
  ).requests;
  assert.ok(listed.some((r) => r.requestId === created.requestId));
});

test('REQ-3 (negative): non-participants cannot create; strangers cannot complete', async () => {
  const store = new SpaceStore();
  const badCreator = await handleToolCall(store, 'requests_create', {
    spaceId: PARTICIPANT_SPACE, createdBy: 'nobody-at-all', title: 'x',
  });
  assert.equal(badCreator.isError, true);
  assert.match(badCreator.content[0].text, /not an active participant/);

  const created = JSON.parse(
    (
      await handleToolCall(store, 'requests_create', {
        spaceId: PARTICIPANT_SPACE, createdBy: 'Treasury Admin', title: 'x',
      })
    ).content[0].text
  ).request;

  const badAssignee = await handleToolCall(store, 'requests_create', {
    spaceId: PARTICIPANT_SPACE, createdBy: 'Treasury Admin', title: 'y', assignee: 'not-here',
  });
  assert.equal(badAssignee.isError, true);
  assert.match(badAssignee.content[0].text, /not an active participant/);

  const stranger = await handleToolCall(store, 'requests_complete', {
    spaceId: PARTICIPANT_SPACE, requestId: created.requestId, actorId: 'part-0002', result: null,
  });
  assert.equal(stranger.isError, true);
  assert.match(stranger.content[0].text, /'Open', cannot complete/, 'unassigned request has no assignee to complete it');
});

test('REQ-4: block and cancel are recorded with reasons and are state-gated', async () => {
  const store = new SpaceStore();
  const created = JSON.parse(
    (
      await handleToolCall(store, 'requests_create', {
        spaceId: PARTICIPANT_SPACE, createdBy: 'Treasury Admin', title: 'x',
      })
    ).content[0].text
  ).request;

  const blocked = JSON.parse(
    (
      await handleToolCall(store, 'requests_block', {
        spaceId: PARTICIPANT_SPACE, requestId: created.requestId,
        actorId: 'Treasury Admin', reason: 'waiting on human approval',
      })
    ).content[0].text
  ).request;
  assert.equal(blocked.status, 'Blocked');

  const cancelled = JSON.parse(
    (
      await handleToolCall(store, 'requests_cancel', {
        spaceId: PARTICIPANT_SPACE, requestId: created.requestId,
        actorId: 'Treasury Admin', reason: 'superseded',
      })
    ).content[0].text
  ).request;
  assert.equal(cancelled.status, 'Cancelled');

  const activity = store.getActivity(PARTICIPANT_SPACE);
  assert.ok(activity.some((a) => a.type === 'REQUEST_BLOCKED' && a.requestId === created.requestId));
  assert.ok(activity.some((a) => a.type === 'REQUEST_CANCELLED' && a.requestId === created.requestId));

  const completed = await handleToolCall(store, 'requests_complete', {
    spaceId: PARTICIPANT_SPACE, requestId: created.requestId, actorId: 'Treasury Admin',
  });
  assert.equal(completed.isError, true);
  assert.match(completed.content[0].text, /cannot complete/);

  const reCancel = await handleToolCall(store, 'requests_cancel', {
    spaceId: PARTICIPANT_SPACE, requestId: created.requestId, actorId: 'Treasury Admin',
  });
  assert.equal(reCancel.isError, true);
  assert.match(reCancel.content[0].text, /already (Completed and cannot be |)Cancelled/);
});

test('REQ-5 (Slice 4): participant receives Request + Context + Authority + Space info', async () => {
  const store = new SpaceStore();
  const created = JSON.parse(
    (
      await handleToolCall(store, 'requests_create', {
        spaceId: PARTICIPANT_SPACE,
        createdBy: 'Treasury Admin',
        assignee: 'Autonomous Procurement Agent',
        title: 'Buy 100 units of X',
        instructions: 'Approved suppliers only.',
        context: { files: ['po-4417.pdf'], budget: '250.00', expected: 'delivered units' },
      })
    ).content[0].text
  ).request;

  const payload = JSON.parse(
    (
      await handleToolCall(store, 'requests_receive', {
        spaceId: PARTICIPANT_SPACE,
        requestId: created.requestId,
        actorId: 'Autonomous Procurement Agent',
      })
    ).content[0].text
  );
  // Request
  assert.equal(payload.request.requestId, created.requestId);
  assert.equal(payload.request.title, 'Buy 100 units of X');
  // Context
  assert.equal(payload.context.files[0], 'po-4417.pdf');
  assert.equal(payload.context.budget, '250.00');
  // Authority: exact rules + granted authority of this participant
  assert.equal(payload.authority.maxPerTransaction, '500.00');
  assert.equal(payload.authority.dailyBudget, '2000.00');
  assert.equal(payload.authority.spentToday, '0.00');
  assert.ok(payload.authority.dailyBudgetRemaining);
  assert.ok(payload.authority.approvedCounterparties.length >= 3);
  assert.equal(payload.authority.canAssigneeComplete, true);
  assert.ok(payload.authority.address, 'participant must be address-backed for onchain authority');
  // Space info
  assert.equal(payload.space.spaceId, PARTICIPANT_SPACE);
  assert.equal(payload.space.treasuryBalance, '5000.00');
  // Participants involved
  assert.ok(payload.participants.some((p) => p.displayName === 'Treasury Admin'));
  assert.ok(payload.participants.some((p) => p.displayName === 'Autonomous Procurement Agent'));
  // No work yet
  assert.equal(payload.work, null);

  // Non-participants cannot receive
  const stranger = await handleToolCall(store, 'requests_receive', {
    spaceId: PARTICIPANT_SPACE, requestId: created.requestId, actorId: 'nobody',
  });
  assert.equal(stranger.isError, true);
  assert.match(stranger.content[0].text, /not an active participant/);
});

// NOTE: REQ-6's settled-payment trace leg now lives in live-settlement.test.js
// (LIVE-6) with a REAL onchain payment. The unknown-request negative stays
// offline-provable:

test('REQ-6b (negative): trace of an unknown request errors', async () => {
  const store = new SpaceStore();
  const bad = await handleToolCall(store, 'activity_trace', {
    spaceId: PARTICIPANT_SPACE, requestId: 'req-none',
  });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /not found/);
});

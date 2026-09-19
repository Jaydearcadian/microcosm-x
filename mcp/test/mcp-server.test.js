import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceStore } from '../src/space-store.js';
import { handleToolCall, TOOL_DEFINITIONS } from '../src/tools.js';

test('MCP-TOOLS: Tool definitions list 10 Space operations (core + Work lifecycle + court verdicts)', () => {
  assert.equal(TOOL_DEFINITIONS.length, 10);
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

test('MCP-2: Agent requests compliant payment ($350) -> Policy PASS -> Settled on X Layer', async () => {
  const store = new SpaceStore();
  const res = await handleToolCall(store, 'payments_request', {
    spaceId: 'space-procurement-001',
    actorId: 'agent-procure-01',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '350.00',
    memo: 'Cloud compute allocation',
  });

  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.status, 'SETTLED');
  assert.ok(data.receipt);
  assert.equal(data.receipt.amount, '350.00');
  assert.equal(data.receipt.network, 'OKX X Layer Testnet');
  assert.equal(data.receipt.chainId, 195);
  assert.ok(data.receipt.txHash.startsWith('0x'));
  assert.equal(data.remainingBalance, '4650.000000');
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

test('MCP-4: Activity log maintains full continuity of settled payments and denials', async () => {
  const store = new SpaceStore();

  // 1. Successful payment
  await handleToolCall(store, 'payments_request', {
    spaceId: 'space-procurement-001',
    actorId: 'agent-procure-01',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '350.00',
    memo: 'Job 1',
  });

  // 2. Denied payment
  await handleToolCall(store, 'payments_request', {
    spaceId: 'space-procurement-001',
    actorId: 'agent-procure-01',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '900.00',
    memo: 'Job 2 (excessive)',
  });

  // 3. Query activity
  const res = await handleToolCall(store, 'activity_list', {
    spaceId: 'space-procurement-001',
  });
  assert.equal(res.isError, undefined);
  const { activity } = JSON.parse(res.content[0].text);

  assert.equal(activity.length, 2);
  assert.equal(activity[0].type, 'PAYMENT_SETTLED');
  assert.equal(activity[0].amount, '350.00');
  assert.equal(activity[1].type, 'PAYMENT_DENIED');
  assert.equal(activity[1].amount, '900.00');
  assert.ok(activity[1].denialProof);
});

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

test('WORK-3: evaluator approves -> Completed, payment settles on OKX X Layer', async () => {
  const store = new SpaceStore();
  const created = JSON.parse(
    (
      await handleToolCall(store, 'work_create', {
        spaceId: WORK_SPACE,
        actorId: WORK_CLIENT,
        provider: WORK_VENDOR,
        evaluator: WORK_EVALUATOR,
        description: 'GPU cluster allocation',
        budget: '350.00',
        deadline: futureDeadline(),
      })
    ).content[0].text
  );
  await handleToolCall(store, 'work_submit', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    actorId: WORK_VENDOR,
    deliverableHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    evidenceUri: 'ipfs://QmApprovalEvidence',
  });

  const res = await handleToolCall(store, 'work_evaluate', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    evaluatorId: WORK_EVALUATOR,
    approved: true,
    feedback: 'Deliverable verified: 100 GPU-hours provisioned',
  });

  assert.equal(res.isError, undefined);
  const data = JSON.parse(res.content[0].text);
  assert.equal(data.status, 'Completed');
  assert.equal(data.job.status, 'Completed');
  // Settlement receipt proves X Layer settlement with deliverable proof bound
  assert.ok(data.receipt);
  assert.equal(data.receipt.status, 'SETTLED');
  assert.equal(data.receipt.network, 'OKX X Layer Testnet');
  assert.equal(data.receipt.chainId, 195);
  assert.ok(data.receipt.txHash.startsWith('0x'));
  assert.equal(data.receipt.amount, '350.000000');
  assert.equal(
    data.receipt.deliverableHash,
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  );
  // Escrowed funds left the Space: balance stays at $4,650 (not refunded)
  assert.equal(data.spaceBalance, '4650.000000');

  const fetched = JSON.parse(
    (await handleToolCall(store, 'work_get', { spaceId: WORK_SPACE, jobId: created.job.jobId }))
      .content[0].text
  );
  assert.equal(fetched.job.status, 'Completed');
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

test('WORK-8: Internet Court approval settles escrow on X Layer', async () => {
  const store = new SpaceStore();
  const COURT = 'court-genlayer-01';
  const rubricHash = '0x' + '1'.repeat(64);

  const created = JSON.parse(
    (
      await handleToolCall(store, 'work_create', {
        spaceId: WORK_SPACE,
        actorId: WORK_CLIENT,
        provider: WORK_VENDOR,
        evaluator: WORK_EVALUATOR,
        adjudicator: COURT,
        rubricHash,
        description: 'Court-gated GPU delivery',
        budget: '300.00',
        deadline: futureDeadline(),
      })
    ).content[0].text
  );
  assert.equal(created.status, 'Funded');
  assert.equal(created.job.adjudicator, COURT);

  const deliverableHash = '0x' + '2'.repeat(64);
  await handleToolCall(store, 'work_submit', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    actorId: WORK_VENDOR,
    deliverableHash,
    evidenceUri: 'ipfs://QmCourtEvidence001',
  });

  // Court-bound work skips single-evaluator settlement.
  const bypass = await handleToolCall(store, 'work_evaluate', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    evaluatorId: WORK_EVALUATOR,
    approved: true,
  });
  assert.equal(bypass.isError, true);

  // Refer to the court: the resolver receives the full case tuple.
  const referred = JSON.parse(
    (
      await handleToolCall(store, 'work_request_verdict', {
        spaceId: WORK_SPACE,
        jobId: created.job.jobId,
        actorId: WORK_CLIENT,
      })
    ).content[0].text
  );
  assert.equal(referred.status, 'Adjudicating');
  assert.equal(referred.case.deliverableHash, deliverableHash);
  assert.equal(referred.case.evidenceUri, 'ipfs://QmCourtEvidence001');
  assert.equal(referred.case.rubricHash, rubricHash);
  assert.ok(referred.case.caseId.startsWith('case-'));

  // Payouts halt while adjudicating.
  const during = await handleToolCall(store, 'work_evaluate', {
    spaceId: WORK_SPACE,
    jobId: created.job.jobId,
    evaluatorId: WORK_EVALUATOR,
    approved: true,
  });
  assert.equal(during.isError, true);

  // The court posts its verdict back: escrow settles on X Layer.
  const verdict = JSON.parse(
    (
      await handleToolCall(store, 'work_post_verdict', {
        spaceId: WORK_SPACE,
        jobId: created.job.jobId,
        adjudicatorId: COURT,
        approved: true,
        reason: 'Deliverable meets rubric: 100 GPU-hours verified',
      })
    ).content[0].text
  );
  assert.equal(verdict.status, 'Completed');
  assert.equal(verdict.job.status, 'Completed');
  assert.ok(verdict.receipt);
  assert.equal(verdict.receipt.network, 'OKX X Layer Testnet');
  assert.equal(verdict.receipt.chainId, 195);
  assert.equal(verdict.receipt.deliverableHash, deliverableHash);
  assert.equal(verdict.spaceBalance, '4700.000000');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceStore } from '../src/space-store.js';
import { handleToolCall, TOOL_DEFINITIONS } from '../src/tools.js';

test('MCP-TOOLS: Tool definitions list 8 Space operations (core + Work lifecycle)', () => {
  assert.equal(TOOL_DEFINITIONS.length, 8);
  const toolNames = TOOL_DEFINITIONS.map((t) => t.name);
  assert.ok(toolNames.includes('spaces_list'));
  assert.ok(toolNames.includes('spaces_capabilities'));
  assert.ok(toolNames.includes('payments_request'));
  assert.ok(toolNames.includes('activity_list'));
  assert.ok(toolNames.includes('work_create'));
  assert.ok(toolNames.includes('work_submit'));
  assert.ok(toolNames.includes('work_evaluate'));
  assert.ok(toolNames.includes('work_get'));
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

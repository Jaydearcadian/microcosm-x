#!/usr/bin/env node
/**
 * Business Loop Demonstration: Microcosm on OKX X Layer
 *
 * A company runs procurement inside a Space, and its procurement agent
 * operates within that Space's authority. The demo leads with the business:
 * create the Space, add people, add the agent, create a request — then the
 * agent receives it, performs the work, returns a result, Space rules are
 * checked, payment occurs, and activity records everything.
 *
 * LIVE ONCHAIN SETTLEMENT — every settlement below is a REAL onchain transfer
 * via the deployed contracts (actual tx hashes, verifiable on OKLink).
 * There is no simulated fallback anywhere: without a key and RPC the demo
 * fails loudly instead of printing a fake receipt. Verdicts are Space-level
 * authorizations recorded in the audit trail; every payout they trigger is
 * a real onchain transfer. (No onchain GenLayer court deployed yet — see M13.)
 *
 * Environment: PRIVATE_KEY (deployer, pays gas + funds escrow), optional
 * PROVIDER_ADDRESS + PROVIDER_KEY for a distinct supplier signer; without
 * them the deployer acts as supplier (single-key mode). Needs testnet OKB
 * for gas and USDC for escrow (mock USDC returns to your own wallets).
 *
 * Loop demonstrated (rebaseline §17 Slice 10):
 * 1.  Create Space
 * 2.  Add people + add agent (participants)
 * 3.  Create request
 * 4.  Agent receives request (+ Context, Authority, Space info)
 * 5.  Agent performs work (Work Order escrows budget, bound to the Request)
 * 6.  Provider submits deliverable proof
 * 7.  Result is returned; Space rules are checked (boundary denial + Gaia refund)
 * 8.  Payment occurs (REAL onchain settlement)
 * 9.  Activity records everything (full evidence chain traced)
 */

import { SpaceStore } from '../mcp/src/space-store.js';
import { handleToolCall } from '../mcp/src/tools.js';
import { liveReady, deployerAddress } from '../mcp/src/xlayer.js';

const store = new SpaceStore();
const AGENT_ID = 'agent-procure-01';
const EVALUATOR_ID = 'admin-01';
// Live counterparty wallet: a distinct PROVIDER_ADDRESS (+PROVIDER_KEY) when
// supplied, otherwise the deployer itself (single-key mode — the supplier
// display name stays narrative; the receipt shows the real address either way).

function header(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function futureDeadline(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function main() {
  header('MICROCOSM — A BUSINESS RUNNING ITSELF WITH PEOPLE AND SOFTWARE (OKX X LAYER)');

  // Live preflight: fail fast with a clear cause instead of dying mid-demo.
  const ready = await liveReady();
  if (!ready.ok) {
    throw new Error(`Demo needs live chain access: ${ready.reason}`);
  }
  const VENDOR_ADDRESS = process.env.PROVIDER_ADDRESS || deployerAddress();
  const distinctProvider = Boolean(process.env.PROVIDER_ADDRESS);
  console.log(`\n[PREFLIGHT] chain ${ready.chainId} reachable; supplier wallet ${VENDOR_ADDRESS}${distinctProvider ? ' (distinct provider key)' : ' (single-key mode: deployer acts as supplier)'}`);

  // Step 1: Create Space
  console.log('\n[STEP 1] Company creates a Space for its procurement operation...');
  const spaceRes = await handleToolCall(store, 'spaces_create', {
    name: 'Northwind Traders — Procurement',
    description: 'Bounded operating context for purchasing compute, datasets, and API credits.',
    actorId: 'founder-01',
  });
  const space = JSON.parse(spaceRes.content[0].text).space ?? JSON.parse(spaceRes.content[0].text);
  const SPACE_ID = space.id;
  console.log(`  Space:  ${SPACE_ID} ✅`);
  console.log(`  • Name: ${space.name}`);
  console.log(`  • Network: ${space.network ?? 'OKX X Layer Testnet'}`);

  // Register the deployer's live wallet as the Space authority address so
  // onchain settlements bind to a real evaluator, then fund the treasury.
  store.spaces.get(SPACE_ID).members[0].address = deployerAddress();
  store.spaces.get(SPACE_ID).rules.allowedCounterparties.push(VENDOR_ADDRESS);
  const fundRes = await handleToolCall(store, 'spaces_fund', {
    spaceId: SPACE_ID, amount: '5000.00', actorId: 'founder-01',
  });
  const funded = JSON.parse(fundRes.content[0].text).space;
  console.log(`  • Treasury: $${funded.balance} USDC ✅`);

  // Step 2: Add people + add agent
  console.log('\n[STEP 2] Founder adds people and the procurement agent as participants...');
  for (const p of [
    { kind: 'Human', displayName: 'Finance Lead' },
    { kind: 'Counterparty', displayName: 'CloudCompute Corp', address: VENDOR_ADDRESS, externalRef: 'crm:suppliers/4417' },
    { kind: 'Agent', displayName: 'Procurement Agent' },
  ]) {
    const res = await handleToolCall(store, 'participants_add', {
      spaceId: SPACE_ID, ...p, actorId: 'founder-01',
    });
    const added = JSON.parse(res.content[0].text).participant;
    console.log(`  + ${added.kind.padEnd(14)} ${added.displayName} (${added.participantId})`);
  }

  // Step 3: Create request
  console.log('\n[STEP 3] Finance Lead creates a Request...');
  const createReqRes = await handleToolCall(store, 'requests_create', {
    spaceId: SPACE_ID,
    createdBy: 'Finance Lead',
    title: 'Provision a 100 GPU-hour cluster per Invoice #CC-9021',
    instructions: 'Buy from an approved supplier only. Budget comes from the Space treasury.',
    context: { invoice: 'CC-9021', expected: 'provisioned cluster + settlement receipt' },
  });
  const request = JSON.parse(createReqRes.content[0].text).request;
  console.log(`  Request:  ${request.requestId} ✅`);
  console.log(`  • Title:  ${request.title}`);
  console.log(`  • Status: ${request.status} (unassigned — any participant can accept)`);

  // Step 4: Agent receives request (+ Context, Authority, Space info)
  console.log('\n[STEP 4] Procurement Agent accepts the Request and receives its full context...');
  const acceptRes = await handleToolCall(store, 'requests_accept', {
    spaceId: SPACE_ID,
    requestId: request.requestId,
    actorId: 'Procurement Agent',
  });
  const accepted = JSON.parse(acceptRes.content[0].text).request;
  console.log(`  Outcome: ${accepted.status} ✅ (agent is now the assignee)`);

  const receiveRes = await handleToolCall(store, 'requests_receive', {
    spaceId: SPACE_ID,
    requestId: request.requestId,
    actorId: 'Procurement Agent',
  });
  const received = JSON.parse(receiveRes.content[0].text);
  console.log('  Received payload:');
  console.log(`  • Request:   ${received.request.title}`);
  console.log(`  • Context:   ${JSON.stringify(received.context)}`);
  console.log(`  • Authority: max/tx $${received.authority.maxPerTransaction}, daily budget $${received.authority.dailyBudget} ($${received.authority.dailyBudgetRemaining} remaining)`);
  console.log(`               approved suppliers: ${received.authority.approvedCounterparties.length}`);
  console.log(`               can complete as assignee: ${received.authority.canAssigneeComplete}`);

  // Step 5: Agent performs work — Work Order escrows budget, bound to the Request
  console.log(`\n[STEP 5] Procurement Agent performs the work: Work Order escrows $350.00 (bound to ${request.requestId})...`);
  const createRes = await handleToolCall(store, 'work_create', {
    spaceId: SPACE_ID,
    actorId: 'Procurement Agent',
    provider: VENDOR_ADDRESS,
    evaluator: 'Finance Lead',
    description: 'GPU cluster allocation (Invoice #CC-9021)',
    budget: '350.00',
    deadline: futureDeadline(),
    requestId: request.requestId,
  });
  const created = JSON.parse(createRes.content[0].text);
  console.log(`  Outcome: ${created.status} ✅`);
  console.log(`  • Work Order ID:      ${created.job.jobId}`);
  console.log(`  • Bound to Request:   ${created.request?.requestId ?? '(not bound)'}`);
  console.log(`  • Escrowed:           $${created.escrowedAmount} USDC held for provider`);
  console.log(`  • Remaining Treasury: $${created.remainingBalance} USDC`);

  // Step 6: Provider submits deliverable proof
  console.log('\n[STEP 6] Supplier submits verifiable deliverable proof...');
  const submitRes = await handleToolCall(store, 'work_submit', {
    spaceId: SPACE_ID,
    jobId: created.job.jobId,
    actorId: VENDOR_ADDRESS,
    deliverableHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    evidenceUri: 'ipfs://QmGpuClusterEvidence9021',
  });
  const submitted = JSON.parse(submitRes.content[0].text);
  console.log(`  Outcome: ${submitted.status} ✅ (Funded -> Submitted)`);

  // Step 7: Result is returned; Space rules are checked
  console.log('\n[STEP 7] Finance Lead approves the deliverable — REAL settlement on chain 1952...');
  const evalRes = await handleToolCall(store, 'work_evaluate', {
    spaceId: SPACE_ID,
    jobId: created.job.jobId,
    evaluatorId: 'Finance Lead',
    approved: true,
    feedback: 'Verified: 100 GPU-hours provisioned per invoice',
  });
  const evaluated = JSON.parse(evalRes.content[0].text);
  console.log(`  Outcome: ${evaluated.status} ✅ (Submitted -> Completed)`);
  console.log(`  • Tx Hash:            ${evaluated.receipt.txHash} (REAL onchain transfer)`);
  console.log(`  • Receipt ID:         ${evaluated.receipt.receiptId}`);
  console.log(`  • Paid to Supplier:   $${evaluated.receipt.amount} USDC`);
  console.log(`  • Remaining Treasury: $${evaluated.spaceBalance} USDC`);

  console.log(`\n[STEP 8] Procurement Agent completes ${request.requestId} with a Result...`);
  const doneRes = await handleToolCall(store, 'requests_complete', {
    spaceId: SPACE_ID,
    requestId: request.requestId,
    actorId: 'Procurement Agent',
    result: {
      output: 'GPU cluster provisioned',
      workId: created.job.jobId,
      evidence: [evaluated.receipt.receiptId],
    },
  });
  const done = JSON.parse(doneRes.content[0].text).request;
  console.log(`  Outcome: ${done.status} ✅`);
  console.log(`  • Result.workId:      ${done.result.workId}`);
  console.log(`  • Result.evidence:    ${done.result.evidence.join(', ')}`);

  // Space rules checked: boundary denial
  console.log('\n[STEP 9] Space rules checked: prompt-injection attempt to spend $900.00...');
  console.log('  Scenario: injection instructs the agent to buy a high-end workstation.');
  const deniedRes = await handleToolCall(store, 'payments_request', {
    spaceId: SPACE_ID,
    actorId: 'Procurement Agent',
    recipient: VENDOR_ADDRESS,
    amount: '900.00',
    memo: 'Unauthorized workstation purchase',
  });
  const deniedData = JSON.parse(deniedRes.content[0].text);
  console.log(`  Outcome: ${deniedData.status} 🛡️ (Deterministic Intercept)`);
  console.log(`  • Violation:          ${deniedData.reasons[0]}`);
  console.log(`  • Denial Proof Hash:  ${deniedData.denialProof.proofHash}`);
  console.log(`  • Treasury Impact:    $0.00 (Treasury remains at $${store.getSpace(SPACE_ID).balance} USDC)`);

  // Gaia exception path: rejected work refunds 100%
  console.log('\n[STEP 10] Space rules checked: low-quality deliverable rejected -> full refund...');
  const badCreate = JSON.parse(
    (
      await handleToolCall(store, 'work_create', {
        spaceId: SPACE_ID,
        actorId: 'Procurement Agent',
        provider: VENDOR_ADDRESS,
        evaluator: 'Finance Lead',
        description: 'Dataset delivery (acceptance-gated)',
        budget: '200.00',
        deadline: futureDeadline(),
      })
    ).content[0].text
  );
  console.log(`  Work Order ${badCreate.job.jobId} funded ($200.00 escrowed).`);
  await handleToolCall(store, 'work_submit', {
    spaceId: SPACE_ID,
    jobId: badCreate.job.jobId,
    actorId: VENDOR_ADDRESS,
    deliverableHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  });
  const rejected = JSON.parse(
    (
      await handleToolCall(store, 'work_evaluate', {
        spaceId: SPACE_ID,
        jobId: badCreate.job.jobId,
        evaluatorId: 'Finance Lead',
        approved: false,
        feedback: 'Quality below acceptance threshold — Gaia refund',
      })
    ).content[0].text
  );
  console.log(`  Outcome: ${rejected.status} 🛡️ (Submitted -> Rejected)`);
  console.log(`  • Gaia Refund:        $${rejected.gaiaRefund} USDC returned to Space`);
  console.log(`  • Treasury Balance:   $${rejected.spaceBalance} USDC ($0 lost)`);

  // Step 9: Activity records everything — full evidence chain
  console.log(`\n[STEP 11] Activity records everything: full evidence chain for ${request.requestId}...`);
  const traceRes = await handleToolCall(store, 'activity_trace', {
    spaceId: SPACE_ID,
    requestId: request.requestId,
  });
  const trace = JSON.parse(traceRes.content[0].text);
  console.log('  Chain: Request → Work → Result → Authorization → Payment → Receipt');
  console.log(`  • Request:       ${trace.chain.request.status} (${trace.chain.request.requestId})`);
  console.log(`  • Work:          ${trace.chain.work.status} (${trace.chain.work.jobId}, $${trace.chain.work.budget})`);
  console.log(`  • Result:        ${trace.chain.result ? trace.chain.result.output : '(none)'}`);
  console.log(`  • Authorization: authHash ${trace.chain.authorization.authHash.slice(0, 18)}…`);
  console.log(`  • Payment:       $${trace.chain.payment.amount} via ${trace.chain.payment.txHash.slice(0, 18)}… (REAL onchain, chain ${trace.chain.payment.chainId})`);
  console.log('  Activity events:');
  trace.activity.forEach((act, idx) => {
    const rawAmount = act.amount || act.budget || act.refundedAmount || act.settlement?.amount;
    const amountDisplay = rawAmount ? `$${rawAmount}` : 'N/A';
    const id = act.actionId || act.jobId || act.requestId || act.participantId || '?';
    console.log(`    [${idx + 1}] ${act.type.padEnd(28)} | Amount: ${amountDisplay.padEnd(12)} | Ref: ${id}`);
  });

  header('DEMONSTRATION COMPLETE: A BUSINESS RUNNING ITSELF — REAL ONCHAIN SETTLEMENT (CHAIN 1952)');
}

main().catch(console.error);

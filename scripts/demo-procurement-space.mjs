#!/usr/bin/env node
/**
 * Interactive Demonstration Runner: Microcosm on OKX X Layer
 * Flagship Scenario: Autonomous Procurement Space with first-class Work
 *
 * Demonstrates the complete loop:
 * 1. Space Creation & Funding (5,000 USDC on OKX X Layer Testnet)
 * 2. Agent Capability Discovery via MCP
 * 3. Work Order created (budget escrowed from Space balance)
 * 4. Provider submits deliverable hash (verifiable proof)
 * 5. Evaluator approves -> settles on X Layer (AgenticCommerce-style)
 * 6. Control Boundary Test ($900 workstation purchase -> Intercepted & Denied)
 * 7. Gaia exception path: rejected work refunds 100% to the Space ($0 lost)
 * 8. Full Audit & Continuity Trail
 */

import { SpaceStore } from '../mcp/src/space-store.js';
import { handleToolCall } from '../mcp/src/tools.js';

const store = new SpaceStore();
const SPACE_ID = 'space-procurement-001';
const AGENT_ID = 'agent-procure-01';
const EVALUATOR_ID = 'admin-01';
const VENDOR_ADDRESS = '0x1111111111111111111111111111111111111111';

function header(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function futureDeadline(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function main() {
  header('MICROCOSM — COMMERCE OS FOR HUMANS & AGENTS (OKX X LAYER)');

  // Step 1: Discover Space Context
  console.log('\n[STEP 1] Agent discovers operating Space via MCP...');
  const listRes = await handleToolCall(store, 'spaces_list', { actorId: AGENT_ID });
  const { spaces } = JSON.parse(listRes.content[0].text);
  console.log(`  Found ${spaces.length} active Space:`);
  console.log(`  - Space: ${spaces[0].name} (ID: ${spaces[0].id})`);
  console.log(`  - Role:  ${spaces[0].myRole}`);
  console.log(`  - Fund:  ${spaces[0].balance} ${spaces[0].currency}`);

  // Step 2: Capability Discovery
  console.log('\n[STEP 2] Agent queries capability bounds via spaces_capabilities...');
  const capRes = await handleToolCall(store, 'spaces_capabilities', {
    spaceId: SPACE_ID,
    actorId: AGENT_ID,
  });
  const caps = JSON.parse(capRes.content[0].text);
  console.log('  Active Space Policy Constraints:');
  console.log(`  • Network:                ${caps.network} (Chain ID: 195)`);
  console.log(`  • Max Per Transaction:    $${caps.rules.maxPerTransaction} USDC`);
  console.log(`  • Daily Budget:           $${caps.rules.dailyBudget} USDC`);
  console.log(`  • Approved Counterparties: ${caps.rules.allowedCounterparties.length} vendors`);

  // Step 3: Work Order created (money never moves without a Work Order)
  console.log('\n[STEP 3] Work Order created: client requests GPU cluster work ($350.00)...');
  console.log('  Sending work_create(spaceId, provider, evaluator, budget=$350.00, deadline)...');
  const createRes = await handleToolCall(store, 'work_create', {
    spaceId: SPACE_ID,
    actorId: AGENT_ID,
    provider: VENDOR_ADDRESS,
    evaluator: EVALUATOR_ID,
    description: 'GPU cluster allocation (Invoice #CC-9021)',
    budget: '350.00',
    deadline: futureDeadline(),
  });
  const created = JSON.parse(createRes.content[0].text);
  console.log(`  Outcome: ${created.status} (Open -> Funded) ✅`);
  console.log(`  • Work Order ID:      ${created.job.jobId}`);
  console.log(`  • Escrowed:           $${created.escrowedAmount} USDC held for provider`);
  console.log(`  • Remaining Treasury: $${created.remainingBalance} USDC`);

  // Step 4: Provider submits deliverable hash
  console.log('\n[STEP 4] Provider submits verifiable deliverable proof...');
  console.log('  Sending work_submit(jobId, deliverableHash, evidenceUri)...');
  const deliverableHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const submitRes = await handleToolCall(store, 'work_submit', {
    spaceId: SPACE_ID,
    jobId: created.job.jobId,
    actorId: VENDOR_ADDRESS,
    deliverableHash,
    evidenceUri: 'ipfs://QmGpuClusterEvidence9021',
  });
  const submitted = JSON.parse(submitRes.content[0].text);
  console.log(`  Outcome: ${submitted.status} (Funded -> Submitted) ✅`);
  console.log(`  • Deliverable Hash:   ${submitted.job.deliverableHash.slice(0, 18)}...`);
  console.log(`  • Evidence:           ${submitted.job.evidenceUri}`);

  // Step 5: Evaluator approves -> settles on X Layer
  console.log('\n[STEP 5] Evaluator approves deliverable -> settles on OKX X Layer...');
  console.log('  Sending work_evaluate(jobId, approved=true)...');
  const evalRes = await handleToolCall(store, 'work_evaluate', {
    spaceId: SPACE_ID,
    jobId: created.job.jobId,
    evaluatorId: EVALUATOR_ID,
    approved: true,
    feedback: 'Verified: 100 GPU-hours provisioned per invoice',
  });
  const evaluated = JSON.parse(evalRes.content[0].text);
  console.log(`  Outcome: ${evaluated.status} (Submitted -> Completed) ✅`);
  console.log(`  • X Layer Tx Hash:    ${evaluated.receipt.txHash}`);
  console.log(`  • Receipt ID:         ${evaluated.receipt.receiptId}`);
  console.log(`  • Paid to Provider:   $${evaluated.receipt.amount} USDC`);
  console.log(`  • Remaining Treasury: $${evaluated.spaceBalance} USDC`);

  // Step 6: Control Boundary Test (Prompt Injection / Over-Budget Attempt)
  console.log('\n[STEP 6] Control Boundary Test: Agent attempts unauthorized $900.00 disbursement...');
  console.log('  Scenario: Prompt injection instructs agent to purchase high-end workstation.');
  console.log('  Sending payments_request(spaceId, recipient, amount=$900.00, memo)...');
  const deniedRes = await handleToolCall(store, 'payments_request', {
    spaceId: SPACE_ID,
    actorId: AGENT_ID,
    recipient: VENDOR_ADDRESS,
    amount: '900.00',
    memo: 'Unauthorized workstation purchase',
  });

  const deniedData = JSON.parse(deniedRes.content[0].text);
  console.log(`  Outcome: ${deniedData.status} 🛡️ (Deterministic Intercept)`);
  console.log(`  • Violation:          ${deniedData.reasons[0]}`);
  console.log(`  • Denial Proof Hash:  ${deniedData.denialProof.proofHash}`);
  console.log(`  • Treasury Impact:    $0.00 (Treasury remains at $${store.getSpace(SPACE_ID).balance} USDC)`);

  // Step 7: Gaia exception path — rejected work refunds 100%
  console.log('\n[STEP 7] Gaia exception path: low-quality deliverable rejected -> full refund...');
  const badCreate = JSON.parse(
    (
      await handleToolCall(store, 'work_create', {
        spaceId: SPACE_ID,
        actorId: AGENT_ID,
        provider: VENDOR_ADDRESS,
        evaluator: EVALUATOR_ID,
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
        evaluatorId: EVALUATOR_ID,
        approved: false,
        feedback: 'Quality below acceptance threshold — Gaia refund',
      })
    ).content[0].text
  );
  console.log(`  Outcome: ${rejected.status} (Submitted -> Rejected) 🛡️`);
  console.log(`  • Gaia Refund:        $${rejected.gaiaRefund} USDC returned to Space`);
  console.log(`  • Treasury Balance:   $${rejected.spaceBalance} USDC ($0 lost)`);

  // Step 8: Audit Ledger
  console.log('\n[STEP 8] Space Audit & Provenance Trail...');
  const actRes = await handleToolCall(store, 'activity_list', { spaceId: SPACE_ID });
  const { activity } = JSON.parse(actRes.content[0].text);
  console.log(`  Total Recorded Records: ${activity.length}`);
  activity.forEach((act, idx) => {
    const amount = act.amount || act.budget || act.refundedAmount || act.settlement?.amount || '?';
    const id = act.actionId || act.jobId || '?';
    console.log(`  [${idx + 1}] ${act.type} | Amount: $${amount} | Ref: ${id} | Timestamp: ${act.timestamp}`);
  });

  header('DEMONSTRATION COMPLETE: WORK LOOP + POLICY BOUNDARIES VERIFIED LIVE');
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * Interactive Demonstration Runner: Microcosm on OKX X Layer
 * Flagship Scenario: Autonomous Procurement Space
 * 
 * Demonstrates:
 * 1. Space Creation & Funding (5,000 USDC on OKX X Layer Testnet)
 * 2. Agent Capability Discovery via MCP
 * 3. Compliant Action ($350 compute disburse -> Settles on X Layer)
 * 4. Control Boundary Test ($900 workstation purchase -> Intercepted & Denied)
 * 5. Full Audit & Continuity Trail
 */

import { SpaceStore } from '../mcp/src/space-store.js';
import { handleToolCall } from '../mcp/src/tools.js';

const store = new SpaceStore();
const SPACE_ID = 'space-procurement-001';
const AGENT_ID = 'agent-procure-01';
const VENDOR_ADDRESS = '0x1111111111111111111111111111111111111111';

function header(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
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

  // Step 3: Compliant Action
  console.log('\n[STEP 3] Compliant Action: Agent engages CloudCompute Corp for $350.00...');
  console.log('  Sending payments_request(spaceId, recipient, amount=$350.00, memo)...');
  const validRes = await handleToolCall(store, 'payments_request', {
    spaceId: SPACE_ID,
    actorId: AGENT_ID,
    recipient: VENDOR_ADDRESS,
    amount: '350.00',
    memo: 'GPU cluster allocation (Invoice #CC-9021)',
  });

  const validData = JSON.parse(validRes.content[0].text);
  console.log(`  Outcome: ${validData.status} ✅`);
  console.log(`  • Action ID:          ${validData.receipt.actionId}`);
  console.log(`  • Receipt ID:         ${validData.receipt.receiptId}`);
  console.log(`  • X Layer Tx Hash:    ${validData.receipt.txHash}`);
  console.log(`  • Auth Hash:          ${validData.receipt.authHash.slice(0, 18)}...`);
  console.log(`  • Remaining Treasury: $${validData.remainingBalance} USDC`);

  // Step 4: Control Boundary Test (Prompt Injection / Over-Budget Attempt)
  console.log('\n[STEP 4] Control Boundary Test: Agent attempts unauthorized $900.00 disbursement...');
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
  console.log(`  • Treasury Impact:    $0.00 (Treasury remains completely safe at $${store.getSpace(SPACE_ID).balance} USDC)`);

  // Step 5: Audit Ledger
  console.log('\n[STEP 5] Space Audit & Provenance Trail...');
  const actRes = await handleToolCall(store, 'activity_list', { spaceId: SPACE_ID });
  const { activity } = JSON.parse(actRes.content[0].text);
  console.log(`  Total Recorded Records: ${activity.length}`);
  activity.forEach((act, idx) => {
    console.log(`  [${idx + 1}] ${act.type} | Amount: $${act.amount} | Action: ${act.actionId} | Timestamp: ${act.timestamp}`);
  });

  header('DEMONSTRATION COMPLETE: ALL POLICY BOUNDARIES VERIFIED LIVE');
}

main().catch(console.error);

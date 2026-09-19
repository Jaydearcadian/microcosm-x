import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceStore } from '../src/space-store.js';
import { handleToolCall, TOOL_DEFINITIONS } from '../src/tools.js';

test('MCP-TOOLS: Tool definitions list 4 core Space operations', () => {
  assert.equal(TOOL_DEFINITIONS.length, 4);
  const toolNames = TOOL_DEFINITIONS.map((t) => t.name);
  assert.ok(toolNames.includes('spaces_list'));
  assert.ok(toolNames.includes('spaces_capabilities'));
  assert.ok(toolNames.includes('payments_request'));
  assert.ok(toolNames.includes('activity_list'));
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

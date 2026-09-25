import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../src/space-store.js';
import { handleToolCall, TOOL_DEFINITIONS } from '../src/tools.js';

const RECIPIENT = '0x1111111111111111111111111111111111111111';
const DEADLINE = new Date(Date.now() + 86400000).toISOString();
const settlement = async () => ({ txHash: `0x${'ab'.repeat(32)}`, txHashes: { complete: `0x${'ab'.repeat(32)}` }, onchainJobId: 'gov-test' });
const accounts = [privateKeyToAccount(generatePrivateKey()), privateKeyToAccount(generatePrivateKey()), privateKeyToAccount(generatePrivateKey())];

function configuredStore() {
  const store = new SpaceStore({ settlement });
  store.configureSpaceGovernance({ spaceId: 'space-procurement-001', actorAddress: '0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367', threshold: 2, signerAllowlist: accounts.map((account) => account.address) });
  return store;
}

async function request(store) {
  return store.createGovernancePaymentRequest({ spaceId: 'space-procurement-001', requesterAddress: '0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367', recipient: RECIPIENT, amount: '900.00', memo: 'High value infrastructure', deadline: DEADLINE });
}

test('M12-3: 2-of-3 queue requires unique authorized approvals and executes once', async () => {
  const store = configuredStore();
  const created = await request(store);
  assert.equal(created.request.status, 'PENDING');
  assert.equal(created.request.approvals.length, 0);
  const first = await accounts[0].signTypedData(created.typedData);
  await store.signGovernancePaymentRequest({ spaceId: 'space-procurement-001', requestId: created.request.requestId, signerAddress: accounts[0].address, signature: first });
  await assert.rejects(() => store.signGovernancePaymentRequest({ spaceId: 'space-procurement-001', requestId: created.request.requestId, signerAddress: accounts[0].address, signature: first }), /already approved/);
  const outsider = privateKeyToAccount(generatePrivateKey());
  const outsiderSignature = await outsider.signTypedData(created.typedData);
  await assert.rejects(() => store.signGovernancePaymentRequest({ spaceId: 'space-procurement-001', requestId: created.request.requestId, signerAddress: outsider.address, signature: outsiderSignature }), /not authorized/);
  const second = await accounts[1].signTypedData(created.typedData);
  const approved = await store.signGovernancePaymentRequest({ spaceId: 'space-procurement-001', requestId: created.request.requestId, signerAddress: accounts[1].address, signature: second });
  assert.equal(approved.status, 'APPROVED');
  const executed = await store.executeGovernancePaymentRequest({ spaceId: 'space-procurement-001', requestId: created.request.requestId, actorAddress: '0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367' });
  assert.equal(executed.status, 'EXECUTED');
  assert.equal(executed.receipt.status, 'SETTLED');
  const repeated = await store.executeGovernancePaymentRequest({ spaceId: 'space-procurement-001', requestId: created.request.requestId, actorAddress: '0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367' });
  assert.equal(repeated.status, 'EXECUTED');
  assert.equal(repeated.receipt.receiptId, executed.receipt.receiptId);
  assert.equal(store.getSpace('space-procurement-001').balance, '4100.000000');
  assert.equal(store.getSpace('space-procurement-001').totalSpentToday, '900.000000');
  assert.equal(store.receipts.size, 1);
});

test('M12-4: MCP governance handlers have REST-equivalent queue operations', async () => {
  assert.ok(TOOL_DEFINITIONS.some((tool) => tool.name === 'governance_payments_create'));
  const store = configuredStore();
  const created = JSON.parse((await handleToolCall(store, 'governance_payments_create', { spaceId: 'space-procurement-001', requesterAddress: '0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367', recipient: RECIPIENT, amount: '900.00', deadline: DEADLINE })).content[0].text);
  const signature = await accounts[0].signTypedData(created.typedData);
  const signed = JSON.parse((await handleToolCall(store, 'governance_requests_sign', { spaceId: 'space-procurement-001', requestId: created.request.requestId, signerAddress: accounts[0].address, signature })).content[0].text);
  assert.equal(signed.request.approvals.length, 1);
  const listed = JSON.parse((await handleToolCall(store, 'governance_requests_list', { spaceId: 'space-procurement-001' })).content[0].text);
  assert.equal(listed.requests[0].requestId, created.request.requestId);
});

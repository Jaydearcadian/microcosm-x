import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../src/space-store.js';
import { handleToolCall, TOOL_DEFINITIONS } from '../src/tools.js';

const SPACE_ID = 'space-procurement-001';
const ASSET = '0x6176287b2E80374B41388029f0b87Eb6eeE289e7';
const RECIPIENT = '0x1111111111111111111111111111111111111111';

function paymentRequired(overrides = {}) {
  return {
    x402Version: 2,
    resource: { url: 'https://example.test/resource' },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:1952',
      amount: '350000000',
      asset: ASSET,
      payTo: RECIPIENT,
      maxTimeoutSeconds: 30,
    }],
    ...overrides,
  };
}

function args(overrides = {}) {
  return { spaceId: SPACE_ID, actorId: 'agent-procure-01', expectedAssetAddress: ASSET, selectedAcceptIndex: 0, ...overrides };
}

function state(store) {
  return JSON.stringify({ space: store.getSpace(SPACE_ID), activity: store.getActivity(SPACE_ID), receipts: [...store.receipts.entries()], jobs: [...store.jobs.entries()] });
}

test('M14-MCP-1: manifest and explicit selected x402 v2 accept validate offline', async () => {
  const store = new SpaceStore();
  const before = state(store);
  const manifestResult = await handleToolCall(store, 'spaces_capability_manifest', { spaceId: SPACE_ID });
  assert.equal(manifestResult.isError, undefined);
  const manifest = JSON.parse(manifestResult.content[0].text).manifest;
  assert.equal(manifest.schema, 'microcosm.space.capability-manifest/v1');
  assert.equal(manifest.policy.maxPerTransaction, '500.00');

  const result = await handleToolCall(store, 'payments_x402_validate', args({ paymentRequired: paymentRequired() }));
  assert.equal(result.isError, undefined);
  const validation = JSON.parse(result.content[0].text).validation;
  assert.equal(validation.valid, true);
  assert.equal(validation.protocolValid, true);
  assert.equal(validation.policyAllowed, true);
  assert.equal(validation.selectedAccept.amountDecimal, '350.000000');
  assert.equal(state(store), before);
});

test('M14-MCP-2: x402 requires explicit selection and rejects wrong version, chain, asset, payTo, amount, and timeout', async () => {
  const store = new SpaceStore();
  const before = state(store);
  const cases = [
    [args({ selectedAcceptIndex: undefined }), /selectedAcceptIndex/],
    [args({ paymentRequired: paymentRequired({ x402Version: 1 }) }), /x402Version/],
    [args({ paymentRequired: paymentRequired({ accepts: [{ ...paymentRequired().accepts[0], network: 'eip155:1' }] }) }), /Network mismatch/],
    [args({ paymentRequired: paymentRequired({ accepts: [{ ...paymentRequired().accepts[0], asset: '0x1111111111111111111111111111111111111111' }] }) }), /Asset mismatch/],
    [args({ paymentRequired: paymentRequired({ accepts: [{ ...paymentRequired().accepts[0], payTo: '0x0000000000000000000000000000000000000000' }] }) }), /payTo/],
    [args({ paymentRequired: paymentRequired({ accepts: [{ ...paymentRequired().accepts[0], amount: '0' }] }) }), /positive uint256/],
    [args({ paymentRequired: paymentRequired({ accepts: [{ ...paymentRequired().accepts[0], maxTimeoutSeconds: 3601 }] }) }), /maxTimeoutSeconds/],
  ];
  for (const [input, pattern] of cases) {
    const result = await handleToolCall(store, 'payments_x402_validate', input);
    assert.equal(result.isError, true);
    assert.match(JSON.parse(result.content[0].text).validation.reasons.join(' '), pattern);
  }
  assert.equal(state(store), before);
});

test('M14-MCP-3: x402 uses the selected accept and applies cap, budget, and allowlist policy', async () => {
  const store = new SpaceStore();
  const first = paymentRequired();
  const second = { ...first, accepts: [first.accepts[0], { ...first.accepts[0], amount: '900000000' }] };
  const result = await handleToolCall(store, 'payments_x402_validate', args({ paymentRequired: second, selectedAcceptIndex: 1 }));
  assert.equal(result.isError, true);
  const denial = JSON.parse(result.content[0].text).validation;
  assert.equal(denial.protocolValid, true);
  assert.equal(denial.policyAllowed, false);
  assert.ok(denial.reasons.some((reason) => reason.includes('per-transaction cap')));

  const budgetSpace = store.getSpace(SPACE_ID);
  budgetSpace.totalSpentToday = '1800.000000';
  const budget = await handleToolCall(store, 'payments_x402_validate', args({ paymentRequired: paymentRequired({ accepts: [{ ...first.accepts[0], amount: '300000000' }] }) }));
  assert.equal(budget.isError, true);
  assert.ok(JSON.parse(budget.content[0].text).validation.reasons.some((reason) => reason.includes('daily budget')));

  const allowlist = await handleToolCall(store, 'payments_x402_validate', args({ paymentRequired: paymentRequired({ accepts: [{ ...first.accepts[0], payTo: '0x9999999999999999999999999999999999999999' }] }) }));
  assert.equal(allowlist.isError, true);
  assert.ok(JSON.parse(allowlist.content[0].text).validation.reasons.some((reason) => reason.includes('approved counterparties')));
  assert.equal(TOOL_DEFINITIONS.some((tool) => tool.name === 'spaces_capability_manifest'), true);
  assert.equal(TOOL_DEFINITIONS.some((tool) => tool.name === 'payments_x402_validate'), true);
});

test('M14-MCP-4: x402 intent create/get/sign/settle share the store lifecycle', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const store = new SpaceStore();
  const space = store.createSpace({ name: 'MCP x402 Space', actorId: account.address });
  store.bindMemberAddress(space.id, account.address, account.address);
  store.fundSpace({ spaceId: space.id, amount: '1000.00', actorId: account.address });
  store.getSpace(space.id).rules.allowedCounterparties = [RECIPIENT];
  const createdResult = await handleToolCall(store, 'payments_x402_intent_create', {
    spaceId: space.id,
    sessionAddress: account.address,
    paymentRequired: paymentRequired(),
    selectedAcceptIndex: 0,
    expectedAssetAddress: ASSET,
  });
  const created = JSON.parse(createdResult.content[0].text);
  assert.equal(created.intent.status, 'PENDING');
  const fetched = await handleToolCall(store, 'payments_x402_intent_get', { spaceId: space.id, intentId: created.intent.intentId, sessionAddress: account.address });
  assert.equal(JSON.parse(fetched.content[0].text).intent.digest, created.intent.digest);
  const signature = await account.signTypedData({
    domain: created.typedData.domain,
    types: created.typedData.types,
    primaryType: created.typedData.primaryType,
    message: { ...created.typedData.message, expiry: BigInt(created.typedData.message.expiry), nonce: BigInt(created.typedData.message.nonce) },
  });
  const signedResult = await handleToolCall(store, 'payments_x402_intent_sign', { spaceId: space.id, intentId: created.intent.intentId, sessionAddress: account.address, signature });
  assert.equal(JSON.parse(signedResult.content[0].text).intent.status, 'SIGNED');
  store.x402SettlementAdapter = { async settle() { return { txHash: `0x${'22'.repeat(32)}`, receipt: { status: 1 } }; } };
  const settledResult = await handleToolCall(store, 'payments_x402_intent_settle', { spaceId: space.id, intentId: created.intent.intentId, sessionAddress: account.address });
  const settled = JSON.parse(settledResult.content[0].text);
  assert.equal(settled.intent.status, 'SETTLED');
  assert.equal(store.getActivity(space.id).filter((entry) => entry.type === 'X402_INTENT_SETTLED').length, 1);
});

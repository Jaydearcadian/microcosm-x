import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { start } from '../src/server.js';

const SPACE_ID = 'space-procurement-001';
const ASSET = '0x6176287b2E80374B41388029f0b87Eb6eeE289e7';
const RECIPIENT = '0x1111111111111111111111111111111111111111';

function paymentRequired(overrides = {}) {
  return {
    x402Version: 2,
    resource: { url: 'https://example.test/resource' },
    accepts: [{ scheme: 'exact', network: 'eip155:1952', amount: '350000000', asset: ASSET, payTo: RECIPIENT, maxTimeoutSeconds: 30 }],
    ...overrides,
  };
}

test('M14-SERVER-1: manifest and x402 validation routes are read-only', async () => {
  const store = new SpaceStore();
  const ctx = await start({ port: 0, store });
  try {
    const before = JSON.stringify({ space: store.getSpace(SPACE_ID), activity: store.getActivity(SPACE_ID) });
    const manifestResponse = await fetch(`${ctx.url}/api/spaces/${SPACE_ID}/capability-manifest`);
    assert.equal(manifestResponse.status, 200);
    const manifestBody = await manifestResponse.json();
    assert.equal(manifestBody.manifest.schema, 'microcosm.space.capability-manifest/v1');
    assert.equal(JSON.stringify(manifestBody).includes('0x6176287b2E80374B41388029f0b87Eb6eeE289e7'), false);

    const validResponse = await fetch(`${ctx.url}/api/spaces/${SPACE_ID}/payments/x402/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentRequired: paymentRequired(), selectedAcceptIndex: 0, actorId: 'agent-procure-01', expectedAssetAddress: ASSET }),
    });
    assert.equal(validResponse.status, 200);
    const valid = await validResponse.json();
    assert.equal(valid.validation.valid, true);
    assert.equal(valid.validation.selectedAccept.amountDecimal, '350.000000');

    const invalidResponse = await fetch(`${ctx.url}/api/spaces/${SPACE_ID}/payments/x402/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentRequired: paymentRequired({ accepts: [{ ...paymentRequired().accepts[0], amount: '0' }] }), selectedAcceptIndex: 0, actorId: 'agent-procure-01', expectedAssetAddress: ASSET }),
    });
    assert.equal(invalidResponse.status, 200);
    assert.equal((await invalidResponse.json()).validation.valid, false);
    assert.equal(JSON.stringify({ space: store.getSpace(SPACE_ID), activity: store.getActivity(SPACE_ID) }), before);
  } finally {
    ctx.server.closeAllConnections?.();
    ctx.server.close();
  }
});

test('M14-SERVER-2: x402 route requires explicit expected asset configuration', async () => {
  const store = new SpaceStore();
  const ctx = await start({ port: 0, store });
  try {
    const response = await fetch(`${ctx.url}/api/spaces/${SPACE_ID}/payments/x402/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentRequired: paymentRequired(), selectedAcceptIndex: 0, actorId: 'agent-procure-01' }),
    });
    assert.equal(response.status, 400);
  } finally {
    ctx.server.closeAllConnections?.();
    ctx.server.close();
  }
});

test('M14-SERVER-3: x402 lifecycle is session-bound and never settles without a real adapter', async () => {
  const founder = privateKeyToAccount(generatePrivateKey());
  const other = privateKeyToAccount(generatePrivateKey());
  let settlementCalls = 0;
  const adapter = {
    asset: ASSET,
    chainId: 1952,
    async settle() {
      settlementCalls += 1;
      return { txHash: `0x${'11'.repeat(32)}`, receipt: { transactionHash: `0x${'11'.repeat(32)}`, status: '0x1' } };
    },
  };
  const store = new SpaceStore();
  const ctx = await start({ port: 0, store });
  const call = async (method, path, body, cookie) => {
    const response = await fetch(`${ctx.url}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { response, json: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
  };
  try {
    const challenge = await call('GET', `/api/auth/challenge?address=${founder.address}`);
    const auth = await call('POST', '/api/auth/session', { address: founder.address, signature: await founder.signMessage({ message: challenge.json.message }) });
    const createdSpace = await call('POST', '/api/spaces', { name: 'x402 Auth Space', actorId: founder.address }, auth.cookie);
    const spaceId = createdSpace.json.space.id;
    store.getSpace(spaceId).rules.allowedCounterparties = [RECIPIENT];
    store.getSpace(spaceId).balance = '5000.00';
    const payment = paymentRequired();
    const created = await call('POST', `/api/spaces/${spaceId}/payments/x402/intents`, { paymentRequired: payment, selectedAcceptIndex: 0, expectedAssetAddress: ASSET, requesterAddress: other.address }, auth.cookie);
    assert.equal(created.response.status, 201);
    assert.equal(created.json.intent.requester, founder.address.toLowerCase());
    assert.equal(created.json.intent.requester, created.json.intent.requesterAddress);
    assert.notEqual(created.json.intent.requester, other.address.toLowerCase());
    assert.equal(created.json.intent.status, 'PENDING');
    assert.equal(store.x402Intents.size, 1);

    const unauthenticated = await call('GET', `/api/spaces/${spaceId}/payments/x402/intents/${created.json.intent.intentId}`);
    assert.equal(unauthenticated.response.status, 401);
    const unsupported = await call('POST', `/api/spaces/${spaceId}/payments/x402/intents/${created.json.intent.intentId}/settle`, {}, auth.cookie);
    assert.equal(unsupported.response.status, 501);
    assert.equal(unsupported.json.error.code, 'UNSUPPORTED_SETTLEMENT');
    assert.equal(store.x402Intents.get(created.json.intent.intentId).status, 'PENDING');
    store.x402SettlementAdapter = adapter;

    const signedMessage = { ...created.json.typedData.message, expiry: BigInt(created.json.typedData.message.expiry), nonce: BigInt(created.json.typedData.message.nonce) };
    const signature = await founder.signTypedData({ domain: created.json.typedData.domain, types: created.json.typedData.types, primaryType: created.json.typedData.primaryType, message: signedMessage });
    const signed = await call('POST', `/api/spaces/${spaceId}/payments/x402/intents/${created.json.intent.intentId}/sign`, { signature, requesterAddress: other.address }, auth.cookie);
    assert.equal(signed.response.status, 200);
    assert.equal(signed.json.intent.status, 'SIGNED');
    const duplicate = await call('POST', `/api/spaces/${spaceId}/payments/x402/intents/${created.json.intent.intentId}/sign`, { signature }, auth.cookie);
    assert.equal(duplicate.response.status, 409);
    const tampered = await call('POST', `/api/spaces/${spaceId}/payments/x402/intents/${created.json.intent.intentId}/settle`, { asset: other.address, network: payment.accepts[0].network, chainId: 1952 }, auth.cookie);
    assert.equal(tampered.response.status, 400);
    const settled = await call('POST', `/api/spaces/${spaceId}/payments/x402/intents/${created.json.intent.intentId}/settle`, {}, auth.cookie);
    assert.equal(settled.response.status, 200);
    assert.equal(settled.json.intent.status, 'SETTLED');
    assert.match(settled.json.intent.txHash, /^0x[0-9a-fA-F]{64}$/);
    const duplicateSettlement = await call('POST', `/api/spaces/${spaceId}/payments/x402/intents/${created.json.intent.intentId}/settle`, {}, auth.cookie);
    assert.equal(duplicateSettlement.response.status, 409);
    assert.equal(settlementCalls, 1);
  } finally {
    ctx.server.closeAllConnections?.();
    ctx.server.close();
  }
});

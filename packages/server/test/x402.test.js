import test from 'node:test';
import assert from 'node:assert/strict';
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

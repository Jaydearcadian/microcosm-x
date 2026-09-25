import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { start } from '../../server/src/server.js';
import { SpaceClient } from '../src/client.js';

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

test('M14-SDK-1: SDK exposes manifest and x402 validation without settlement', async () => {
  const store = new SpaceStore();
  const ctx = await start({ port: 0, store });
  const client = new SpaceClient(ctx.url);
  try {
    const before = JSON.stringify({ space: store.getSpace(SPACE_ID), activity: store.getActivity(SPACE_ID), receipts: [...store.receipts.entries()] });
    const manifestResponse = await client.getCapabilityManifest(SPACE_ID);
    assert.equal(manifestResponse.manifest.schema, 'microcosm.space.capability-manifest/v1');
    const valid = await client.validateX402PaymentIntent(SPACE_ID, { paymentRequired: paymentRequired(), selectedAcceptIndex: 0, actorId: 'agent-procure-01', expectedAssetAddress: ASSET });
    assert.equal(valid.validation.valid, true);
    assert.equal(valid.validation.selectedAccept.amountDecimal, '350.000000');
    const invalid = await client.validateX402Payment(SPACE_ID, { paymentRequired: paymentRequired({ accepts: [{ ...paymentRequired().accepts[0], network: 'eip155:1' }] }), selectedAcceptIndex: 0, actorId: 'agent-procure-01', expectedAssetAddress: ASSET });
    assert.equal(invalid.validation.valid, false);
    assert.equal(JSON.stringify({ space: store.getSpace(SPACE_ID), activity: store.getActivity(SPACE_ID), receipts: [...store.receipts.entries()] }), before);
  } finally {
    ctx.server.closeAllConnections?.();
    ctx.server.close();
  }
});

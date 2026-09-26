/**
 * SDK client tests against a REAL local server (fresh in-memory store).
 * Offline paths only — no chain interaction. Live onboarding runs in
 * wizard.test.js (chain harness, EC2/testnet).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from '../../server/src/server.js';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { SpaceClient, PolicyDenial, ApiError } from '../src/client.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { signIn } from './helpers-auth.mjs';

const VENDOR = '0x1111111111111111111111111111111111111111';

let client;
let ctx;
let store;
let ada;

test.before(async () => {
  store = new SpaceStore();
  ctx = await start({ port: 0, store });
  // A Space owner is a real wallet, so the suite can sign in and act as one.
  ada = privateKeyToAccount(generatePrivateKey());
  client = new SpaceClient(ctx.url, { cookie: await signIn(ctx.url, ada) });
});

test.after(async () => {
  ctx.server.closeAllConnections?.();
  ctx.server.close();
});

test('SDK-1: health + space lifecycle + bounds shape', async () => {
  const health = await client.health();
  assert.equal(health.ok, true);

  const { space } = await client.createSpace({ name: 'SDK Space', actorId: ada.address });
  assert.ok(space.id.startsWith('space-'));
  const fetched = await client.getSpace(space.id);
  assert.equal(fetched.space.name, 'SDK Space');

  await client.fundSpace(space.id, { amount: '5000.00', actorId: ada.address });
  const bounds = await client.bounds(space.id);
  assert.equal(bounds.treasuryBalance, '5000.000000');
  assert.equal(bounds.remaining, '2000.000000');
  assert.equal(bounds.denials, 0);
  ctx.spaceId = space.id;
});

test('SDK-2: typed PolicyDenial on boundary violation', async () => {
  const err = await client.requestPayment(ctx.spaceId, {
    actorId: ada.address, recipient: VENDOR, amount: '900.00',
  }).then(() => null, (e) => e);
  assert.ok(err instanceof PolicyDenial);
  assert.equal(err.code, 'POLICY_DENIAL');
  assert.ok(err.denialProof.proofHash.startsWith('0x'));
  assert.ok(err.reasons.length > 0);
});

test('SDK-3: typed ApiError codes (404 validation/state)', async () => {
  const nf = await client.getSpace('space-nope').then(() => null, (e) => e);
  assert.ok(nf instanceof ApiError);
  assert.equal(nf.status, 404);

  const bad = await client.createSpace({}).then(() => null, (e) => e);
  assert.ok(bad instanceof ApiError);
  assert.equal(bad.status, 400);
});

test('SDK-4: participants + request loop + trace over SDK', async () => {
  const { spaceId } = ctx;
  const agent = await client.addParticipant(spaceId, { kind: 'Agent', displayName: 'SdkBot' });
  assert.ok(agent.participant.participantId.startsWith('part-'));

  const { request } = await client.createRequest(spaceId, { createdBy: ada.address, title: 'SDK job' });
  assert.equal(request.status, 'Open');
  const accepted = await client.acceptRequest(spaceId, request.requestId, { actorId: 'SdkBot' });
  assert.equal(accepted.request.status, 'Assigned');

  const received = await client.receiveRequest(spaceId, request.requestId, 'SdkBot');
  assert.ok(received.authority);
  assert.ok(received.space);

  const trace = await client.traceRequest(spaceId, request.requestId);
  assert.equal(trace.requestId, request.requestId);
  assert.ok(Array.isArray(trace.activity));
});

test('SDK-5: SSE events() yields the live denial envelope', async () => {
  const { spaceId } = ctx;
  const seen = [];
  const iter = client.events(spaceId);
  const pump = (async () => {
    for await (const env of iter) {
      seen.push(env);
      if (seen.length >= 1) break;
    }
  })();
  await client.requestPayment(spaceId, { actorId: ada.address, recipient: VENDOR, amount: '950.00' })
    .then(() => null, () => null);
  await Promise.race([
    pump,
    new Promise((_, reject) => setTimeout(() => reject(new Error('SSE timeout')), 8000)),
  ]);
  assert.equal(seen[0].type, 'PAYMENT_DENIED');
  assert.equal(seen[0].spaceId, spaceId);
  assert.ok(Number.isInteger(seen[0].seq));
});

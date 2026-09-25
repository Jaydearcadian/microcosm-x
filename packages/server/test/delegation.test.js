import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { load, save } from '../src/persist.js';
import { start } from '../src/server.js';

const child = privateKeyToAccount(generatePrivateKey());
const vendor = '0x1111111111111111111111111111111111111111';

async function request(base, method, path, body, cookie) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json().catch(() => ({})), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

async function session(base, account) {
  const challenge = await request(base, 'GET', `/api/auth/challenge?address=${account.address}`);
  const signature = await account.signMessage({ message: challenge.json.message });
  return (await request(base, 'POST', '/api/auth/session', { address: account.address, signature })).cookie;
}

function delegation(spaceId, founder, overrides = {}) {
  return {
    spaceId,
    delegationId: 'delegation-rest-1',
    parentActor: founder.address,
    child: child.address,
    parentRole: 'admin',
    childRole: 'agent',
    maxPerTransaction: '100.00',
    dailyBudget: '200.00',
    allowedCounterparties: [vendor],
    asset: 'USDC',
    chainId: 1952,
    nonce: '1',
    expiry: String(Math.floor(Date.now() / 1000) + 3600),
    policySnapshotHash: `0x${'1'.repeat(64)}`,
    ...overrides,
  };
}

test('M10-7: authenticated REST delegation lifecycle binds parent session and exposes exact verification', async () => {
  const founder = privateKeyToAccount(generatePrivateKey());
  const store = new SpaceStore({ seed: false });
  const ctx = await start({ port: 0, store });
  try {
    const cookie = await session(ctx.url, founder);
    const createdSpace = await request(ctx.url, 'POST', '/api/spaces', { name: 'REST Delegation Space', actorId: founder.address }, cookie);
    const spaceId = createdSpace.json.space.id;
    await request(ctx.url, 'POST', `/api/spaces/${spaceId}/participants`, { kind: 'Agent', displayName: 'Child Agent', address: child.address }, cookie);
    store.getSpace(spaceId).rules.allowedCounterparties = [vendor];
    const created = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/delegations`, delegation(spaceId, founder), cookie);
    assert.equal(created.status, 201);
    assert.equal(created.json.delegation.parentActor, founder.address.toLowerCase());
    const signature = await founder.signTypedData(created.json.typedData);
    const signed = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/delegations/delegation-rest-1/sign`, { signature }, cookie);
    assert.equal(signed.status, 200);
    const verified = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/delegations/delegation-rest-1/verify`, {}, cookie);
    assert.equal(verified.status, 200);
    assert.equal(verified.json.verification.valid, true);
    const revoked = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/delegations/delegation-rest-1/revoke`, {}, cookie);
    assert.equal(revoked.status, 200);
    assert.equal(revoked.json.delegation.status, 'REVOKED');
    const unauthenticated = await request(ctx.url, 'GET', `/api/spaces/${spaceId}/delegations`);
    assert.equal(unauthenticated.status, 401);
  } finally {
    ctx.server.closeAllConnections?.();
    ctx.server.close();
  }
});

test('M10-8: delegation maps, nonce claims, status, signature, and activity persist', async () => {
  const founder = privateKeyToAccount(generatePrivateKey());
  const store = new SpaceStore({ seed: false });
  const space = store.createSpace({ name: 'Persisted Delegation Space', actorId: founder.address });
  store.bindMemberAddress(space.id, founder.address, founder.address);
  store.addParticipant({ spaceId: space.id, kind: 'Agent', displayName: 'Child Agent', address: child.address });
  store.getSpace(space.id).rules.allowedCounterparties = [vendor];
  const created = store.createDelegation(delegation(space.id, founder));
  const signature = await founder.signTypedData(created.typedData);
  await store.signDelegation({ spaceId: space.id, delegationId: 'delegation-rest-1', parentActor: founder.address, signature });
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'microcosm-delegation-'));
  const file = path.join(directory, 'snapshot.json');
  try {
    save(store, file);
    const restored = new SpaceStore({ seed: false });
    assert.equal(load(restored, file), true);
    const restoredDelegation = restored.getDelegation({ spaceId: space.id, delegationId: 'delegation-rest-1' });
    assert.equal(restoredDelegation.status, 'SIGNED');
    assert.equal(restoredDelegation.signature, signature);
    assert.equal(restored.delegationNonces.size, 1);
    assert.throws(() => restored.createDelegation(delegation(space.id, founder, { delegationId: 'delegation-rest-2' })), /Duplicate delegation nonce/);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});

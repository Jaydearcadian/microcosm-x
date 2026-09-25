import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../src/space-store.js';
import { handleToolCall, TOOL_DEFINITIONS } from '../src/tools.js';

const founder = privateKeyToAccount(generatePrivateKey());
const child = privateKeyToAccount(generatePrivateKey());
const vendor = '0x1111111111111111111111111111111111111111';

function setup() {
  const store = new SpaceStore({ seed: false });
  const space = store.createSpace({ name: 'Delegation Space', actorId: founder.address });
  store.bindMemberAddress(space.id, founder.address, founder.address);
  store.addParticipant({ spaceId: space.id, kind: 'Agent', displayName: 'Child Agent', address: child.address });
  store.getSpace(space.id).rules.allowedCounterparties = [vendor, '0x2222222222222222222222222222222222222222'];
  return { store, spaceId: space.id };
}

function args(spaceId, overrides = {}) {
  return {
    spaceId,
    delegationId: 'delegation-1',
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

test('M10-5: MCP exposes create, exact signing, verification, list, and revoke without payment settlement', async () => {
  assert.ok(TOOL_DEFINITIONS.some((tool) => tool.name === 'delegations_create'));
  const { store, spaceId } = setup();
  const before = store.getSpace(spaceId).balance;
  const created = JSON.parse((await handleToolCall(store, 'delegations_create', args(spaceId))).content[0].text);
  assert.equal(created.delegation.status, 'PENDING');
  assert.equal(store.getSpace(spaceId).balance, before);
  const signature = await founder.signTypedData(created.typedData);
  const signed = JSON.parse((await handleToolCall(store, 'delegations_sign', { spaceId, delegationId: 'delegation-1', parentActor: founder.address, signature })).content[0].text);
  assert.equal(signed.delegation.status, 'SIGNED');
  const verified = JSON.parse((await handleToolCall(store, 'delegations_verify', { spaceId, delegationId: 'delegation-1' })).content[0].text);
  assert.equal(verified.valid, true);
  const listed = JSON.parse((await handleToolCall(store, 'delegations_list', { spaceId })).content[0].text);
  assert.equal(listed.delegations.length, 1);
  const revoked = JSON.parse((await handleToolCall(store, 'delegations_revoke', { spaceId, delegationId: 'delegation-1', parentActor: founder.address })).content[0].text);
  assert.equal(revoked.delegation.status, 'REVOKED');
  await assert.rejects(() => store.verifyDelegation({ spaceId, delegationId: 'delegation-1' }), /not signed/);
});

test('M10-6: duplicate nonce, expansion, tamper, and revocation fail loudly', async () => {
  const { store, spaceId } = setup();
  const created = store.createDelegation(args(spaceId));
  assert.throws(() => store.createDelegation(args(spaceId, { delegationId: 'delegation-2' })), /Duplicate delegation nonce/);
  assert.throws(() => store.createDelegation(args(spaceId, { delegationId: 'delegation-3', nonce: '2', maxPerTransaction: '501' })), /expands parent authority/);
  const signature = await founder.signTypedData(created.typedData);
  await store.signDelegation({ spaceId, delegationId: 'delegation-1', parentActor: founder.address, signature });
  await assert.rejects(() => store.verifyDelegation({ spaceId, delegationId: 'delegation-1', delegation: { ...created.delegation, dailyBudget: '1' } }), /tampered/);
  store.revokeDelegation({ spaceId, delegationId: 'delegation-1', parentActor: founder.address });
  assert.throws(() => store.revokeDelegation({ spaceId, delegationId: 'delegation-1', parentActor: founder.address }), /already revoked/);
});

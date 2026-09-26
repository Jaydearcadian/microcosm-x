/**
 * An agent, driving the product the way an agent actually does.
 *
 * The server accepts a delegationId and the policy engine enforces it, but an
 * MCP agent arrives over stdio with no cookie and no session. If the tool layer
 * did not carry the delegation through, the enforcement would be real and
 * completely unusable — every agent call refused.
 *
 * These tests go through handleToolCall, the same entry point the stdio server
 * dispatches to, so they exercise the path an agent takes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../src/space-store.js';
import { handleToolCall, TOOL_DEFINITIONS } from '../src/tools.js';

const founder = privateKeyToAccount(generatePrivateKey());
const agent = privateKeyToAccount(generatePrivateKey());
const VENDOR = '0x1111111111111111111111111111111111111111';
const AGENT_NAME = 'ProcureBot';

function setup() {
  const store = new SpaceStore({
    seed: false,
    settlement: async () => ({ txHash: `0x${'ab'.repeat(32)}`, receipt: { status: 1 } }),
  });
  const space = store.createSpace({ name: 'Agent MCP Space', actorId: founder.address });
  store.bindMemberAddress(space.id, founder.address, founder.address);
  store.addParticipant({ spaceId: space.id, kind: 'Agent', displayName: AGENT_NAME, address: agent.address });
  store.fundSpace({ spaceId: space.id, amount: '1000.00', actorId: founder.address });
  store.getSpace(space.id).rules.allowedCounterparties = [VENDOR];
  return { store, spaceId: space.id };
}

async function delegate(store, spaceId, overrides = {}) {
  const created = store.createDelegation({
    spaceId,
    delegationId: 'delegation-mcp-1',
    parentActor: founder.address,
    child: agent.address,
    parentRole: 'admin',
    childRole: 'agent',
    maxPerTransaction: '100.00',
    dailyBudget: '200.00',
    allowedCounterparties: [VENDOR],
    asset: 'USDC',
    chainId: 1952,
    nonce: '1',
    expiry: String(Math.floor(Date.now() / 1000) + 3600),
    policySnapshotHash: `0x${'0'.repeat(64)}`,
    ...overrides,
  });
  await store.signDelegation({
    spaceId,
    delegationId: 'delegation-mcp-1',
    parentActor: founder.address,
    signature: await founder.signTypedData(created.typedData),
  });
  return 'delegation-mcp-1';
}

const call = async (store, tool, args) => JSON.parse((await handleToolCall(store, tool, args)).content[0].text);

// --- the schema has to admit it, or the agent cannot express the call at all

test('MCP-1: the spending tools accept a delegationId', () => {
  for (const name of ['payments_request', 'work_create']) {
    const tool = TOOL_DEFINITIONS.find((t) => t.name === name);
    assert.ok(tool, `${name} is missing`);
    assert.ok(
      tool.inputSchema.properties.delegationId,
      `${name} does not accept a delegationId, so an agent cannot present one`,
    );
  }
});

// --- and the call has to work end to end over the tool layer

test('MCP-2: an agent pays through MCP by presenting its delegation', async () => {
  const { store, spaceId } = setup();
  const delegationId = await delegate(store, spaceId);
  const result = await call(store, 'payments_request', {
    spaceId, actorId: AGENT_NAME, recipient: VENDOR, amount: '50.00', delegationId,
  });
  assert.equal(result.status, 'SETTLED', JSON.stringify(result));
  assert.equal(store.getSpace(spaceId).balance, '950.000000');
});

test('MCP-3: the same call without the delegation is refused', async () => {
  const { store, spaceId } = setup();
  await delegate(store, spaceId);
  const res = await handleToolCall(store, 'payments_request', {
    spaceId, actorId: AGENT_NAME, recipient: VENDOR, amount: '50.00',
  });
  assert.equal(res.isError, true);
  const result = JSON.parse(res.content[0].text);
  assert.equal(result.status, 'REJECTED');
  assert.ok(
    result.reasons.some((r) => /no signed delegation/.test(r)),
    `expected a missing-delegation reason, got: ${JSON.stringify(result.reasons)}`,
  );
});

test('MCP-4: the delegation does not lift the cap it signed', async () => {
  const { store, spaceId } = setup();
  const delegationId = await delegate(store, spaceId);
  const res = await handleToolCall(store, 'payments_request', {
    spaceId, actorId: AGENT_NAME, recipient: VENDOR, amount: '100.01', delegationId,
  });
  assert.equal(res.isError, true);
  const result = JSON.parse(res.content[0].text);
  assert.ok(result.reasons.some((r) => /per-transaction cap/.test(r)));
});

test('MCP-5: revoking the delegation stops the agent at the next call', async () => {
  const { store, spaceId } = setup();
  const delegationId = await delegate(store, spaceId);
  assert.equal(
    (await call(store, 'payments_request', { spaceId, actorId: AGENT_NAME, recipient: VENDOR, amount: '10.00', delegationId })).status,
    'SETTLED',
  );
  store.revokeDelegation({ spaceId, delegationId, parentActor: founder.address });
  const res = await handleToolCall(store, 'payments_request', {
    spaceId, actorId: AGENT_NAME, recipient: VENDOR, amount: '10.00', delegationId,
  });
  assert.equal(res.isError, true);
  assert.ok(JSON.parse(res.content[0].text).reasons.some((r) => /revoked/.test(r)));
});

test('MCP-6: an agent escrows through work_create with its delegation', async () => {
  const { store, spaceId } = setup();
  const delegationId = await delegate(store, spaceId);
  const result = await call(store, 'work_create', {
    spaceId,
    actorId: AGENT_NAME,
    provider: VENDOR,
    evaluator: AGENT_NAME,
    description: 'GPU hours',
    budget: '80.00',
    deadline: new Date(Date.now() + 86400000).toISOString(),
    delegationId,
  });
  assert.equal(result.status, 'Funded', JSON.stringify(result));
  assert.equal(store.getSpace(spaceId).balance, '920.000000');
});

test('MCP-7: escrow without the delegation is refused and the treasury is untouched', async () => {
  const { store, spaceId } = setup();
  await delegate(store, spaceId);
  const res = await handleToolCall(store, 'work_create', {
    spaceId,
    actorId: AGENT_NAME,
    provider: VENDOR,
    evaluator: AGENT_NAME,
    description: 'GPU hours',
    budget: '80.00',
    deadline: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(res.isError, true);
  assert.equal(store.getSpace(spaceId).balance, '1000.000000');
});

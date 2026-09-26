/**
 * What an agent is actually allowed to spend.
 *
 * Before this, `requestPayment` accepted an `actorId` string in an
 * unauthenticated body and matched it against `space.members[].name`. Naming a
 * participant "Procurement Agent" was therefore the whole of agent onboarding,
 * and anything that could reach the server or spawn the stdio MCP process was a
 * spending principal the moment it knew the name.
 *
 * These tests pin the replacement: an agent spends only under a delegation its
 * Space owner signed, and that delegation can only ever narrow the Space's own
 * limits, never widen them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../src/space-store.js';

const founder = privateKeyToAccount(generatePrivateKey());
const agent = privateKeyToAccount(generatePrivateKey());
const secondAgent = privateKeyToAccount(generatePrivateKey());
const outsider = privateKeyToAccount(generatePrivateKey());
const vendor = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';

const AGENT_NAME = 'Procurement Agent';

function setup({ spaceRules = {} } = {}) {
  // An approved payment settles on chain, so the tests inject a stub rather
  // than reaching a real network. What is under test here is the decision to
  // approve or refuse, not the settlement itself.
  const store = new SpaceStore({
    seed: false,
    settlement: async () => ({ txHash: `0x${'ab'.repeat(32)}`, receipt: { status: 1 } }),
  });
  const space = store.createSpace({ name: 'Authority Space', actorId: founder.address });
  store.bindMemberAddress(space.id, founder.address, founder.address);
  store.fundSpace({ spaceId: space.id, amount: '500.00', actorId: founder.address });
  // Two agents, so we can prove they do not share one allowance.
  store.addParticipant({ spaceId: space.id, kind: 'Agent', displayName: AGENT_NAME, address: agent.address });
  store.addParticipant({ spaceId: space.id, kind: 'Agent', displayName: 'Second Agent', address: secondAgent.address });
  const live = store.getSpace(space.id);
  live.rules.allowedCounterparties = [vendor, other];
  Object.assign(live.rules, spaceRules);
  return { store, spaceId: space.id };
}

function spec(spaceId, overrides = {}) {
  return {
    spaceId,
    delegationId: overrides.delegationId || 'delegation-1',
    parentActor: founder.address,
    child: agent.address,
    parentRole: 'admin',
    childRole: 'agent',
    maxPerTransaction: '100.00',
    dailyBudget: '200.00',
    allowedCounterparties: [vendor],
    asset: 'USDC',
    chainId: 1952,
    nonce: overrides.nonce || '1',
    expiry: String(Math.floor(Date.now() / 1000) + 3600),
    policySnapshotHash: `0x${'1'.repeat(64)}`,
    ...overrides,
  };
}

/** Creates and signs a delegation the way a Space owner would from a wallet. */
async function delegate(store, spaceId, overrides = {}) {
  const args = spec(spaceId, overrides);
  const created = store.createDelegation(args);
  const signer = args.parentActor === founder.address ? founder : outsider;
  const signature = await signer.signTypedData(created.typedData);
  await store.signDelegation({
    spaceId,
    delegationId: args.delegationId,
    parentActor: args.parentActor,
    signature,
  });
  return args.delegationId;
}

const pay = (store, spaceId, extra = {}) =>
  store.requestPayment({
    spaceId,
    actorId: AGENT_NAME,
    recipient: vendor,
    amount: '50.00',
    ...extra,
  });

// --- the whole point: a name is not authority

test('M14-1: an agent with no delegation cannot spend at all', async () => {
  const { store, spaceId } = setup();
  const result = await pay(store, spaceId);
  assert.equal(result.status, 'REJECTED');
  assert.ok(
    result.reasons.some((r) => /presented no signed delegation/.test(r)),
    `expected a missing-delegation reason, got: ${result.reasons.join(' | ')}`,
  );
});

test('M14-2: an unsigned or revoked delegation is refused, not ignored', async () => {
  const { store, spaceId } = setup();
  const created = store.createDelegation(spec(spaceId, { delegationId: 'delegation-pending' }));
  assert.equal(created.delegation.status, 'PENDING');
  const unsigned = await pay(store, spaceId, { delegationId: 'delegation-pending' });
  assert.equal(unsigned.status, 'REJECTED');
  assert.ok(unsigned.reasons.some((r) => /has not been signed/.test(r)));

  const delegationId = await delegate(store, spaceId, { delegationId: 'delegation-2', nonce: '2' });
  store.revokeDelegation({ spaceId, delegationId, parentActor: founder.address });
  const revoked = await pay(store, spaceId, { delegationId });
  assert.equal(revoked.status, 'REJECTED');
  assert.ok(revoked.reasons.some((r) => /was revoked/.test(r)));
});

test('M14-3: a delegation stops working the moment it expires', async () => {
  const { store, spaceId } = setup();
  // An already-expired delegation is refused at creation, so the only way to
  // reach the runtime check is to let a live one lapse.
  assert.throws(
    () => store.createDelegation(spec(spaceId, { delegationId: 'delegation-born-dead', expiry: String(Math.floor(Date.now() / 1000) - 60) })),
    /expired/,
  );
  const delegationId = await delegate(store, spaceId, { delegationId: 'delegation-lapsing' });
  assert.equal((await pay(store, spaceId, { delegationId })).status, 'SETTLED');

  const realNow = Date.now;
  Date.now = () => realNow() + 2 * 60 * 60 * 1000;
  try {
    const lapsed = await pay(store, spaceId, { delegationId });
    assert.equal(lapsed.status, 'REJECTED');
    assert.ok(lapsed.reasons.some((r) => /expired/.test(r)), `got: ${lapsed.reasons.join(' | ')}`);
  } finally {
    Date.now = realNow;
  }
});

test('M14-4: somebody outside the Space cannot issue a delegation at all', async () => {
  const { store, spaceId } = setup();
  // Outsider holds a real key and can sign anything. That is not the point:
  // the store refuses the delegation before a signature is ever requested,
  // because authority comes from Space membership, not from holding a key.
  assert.throws(
    () => store.createDelegation(spec(spaceId, { parentActor: outsider.address })),
    /not a spending member/,
  );
  assert.equal(store.listDelegations({ spaceId }).length, 0);
});

test('M14-5: a delegation addressed to a different agent is refused', async () => {
  const { store, spaceId } = setup();
  const delegationId = await delegate(store, spaceId, { child: secondAgent.address });
  const result = await pay(store, spaceId, { delegationId });
  assert.equal(result.status, 'REJECTED');
  assert.ok(result.reasons.some((r) => /is addressed to/.test(r)));
});

// --- the happy path, so the refusals above mean something

test('M14-6: a signed delegation lets the agent spend inside its own limits', async () => {
  const { store, spaceId } = setup();
  const delegationId = await delegate(store, spaceId);
  const result = await pay(store, spaceId, { delegationId });
  assert.equal(result.status, 'SETTLED', `expected approval, got: ${result.reasons?.join(' | ')}`);
  assert.equal(store.getSpace(spaceId).balance, '450.000000');
});

test('M14-7: the agent cannot exceed the per-transaction cap its owner signed', async () => {
  const { store, spaceId } = setup();
  const delegationId = await delegate(store, spaceId);
  const result = await pay(store, spaceId, { delegationId, amount: '100.01' });
  assert.equal(result.status, 'REJECTED');
  assert.ok(result.reasons.some((r) => /per-transaction cap/.test(r)));
});

test('M14-8: the agent cannot pay a recipient its owner never listed', async () => {
  const { store, spaceId } = setup();
  const delegationId = await delegate(store, spaceId);
  const result = await pay(store, spaceId, { delegationId, recipient: other });
  assert.equal(result.status, 'REJECTED');
});

test('M14-9: the agent runs out of daily budget across several payments', async () => {
  const { store, spaceId } = setup();
  const delegationId = await delegate(store, spaceId);
  assert.equal((await pay(store, spaceId, { delegationId, amount: '100.00' })).status, 'SETTLED');
  assert.equal((await pay(store, spaceId, { delegationId, amount: '100.00' })).status, 'SETTLED');
  const third = await pay(store, spaceId, { delegationId, amount: '0.01' });
  assert.equal(third.status, 'REJECTED');
  assert.ok(third.reasons.some((r) => /daily budget/.test(r)));
});

test('M14-10: two agents do not spend from a shared allowance', async () => {
  // A deliberately large Space budget, so the only ceiling under test here is
  // each agent's own. Both ceilings are real; SPACE-5 covers the Space one.
  const { store, spaceId } = setup({ spaceRules: { maxPerTransaction: '500.00', dailyBudget: '5000.00' } });
  const first = await delegate(store, spaceId);
  const second = await delegate(store, spaceId, {
    delegationId: 'delegation-second',
    nonce: '2',
    child: secondAgent.address,
  });
  assert.equal((await pay(store, spaceId, { delegationId: first, amount: '100.00' })).status, 'SETTLED');
  assert.equal((await pay(store, spaceId, { delegationId: first, amount: '100.00' })).status, 'SETTLED');
  // The first agent is exhausted; the second still has its own full budget.
  assert.equal((await pay(store, spaceId, { delegationId: first, amount: '0.01' })).status, 'REJECTED');
  const otherSpend = await store.requestPayment({
    spaceId,
    actorId: 'Second Agent',
    recipient: vendor,
    amount: '100.00',
    delegationId: second,
  });
  assert.equal(otherSpend.status, 'SETTLED', `expected approval, got: ${otherSpend.reasons?.join(' | ')}`);
});

// --- attenuation: a delegation is a ceiling, never a way to widen the Space

test('M14-11: a delegation cannot widen the Space it is issued under', async () => {
  const { store, spaceId } = setup({
    spaceRules: { maxPerTransaction: '30.00', dailyBudget: '40.00' },
  });
  // Refused at creation, before any signature is involved.
  assert.throws(
    () => store.createDelegation(spec(spaceId, { delegationId: 'delegation-wide', maxPerTransaction: '900.00', dailyBudget: '9000.00' })),
    /expands parent authority/,
  );
  // And the tighter of the two is what actually applies at payment time.
  const delegationId = await delegate(store, spaceId, {
    delegationId: 'delegation-tight',
    maxPerTransaction: '20.00',
    dailyBudget: '25.00',
  });
  assert.equal((await pay(store, spaceId, { delegationId, amount: '20.00' })).status, 'SETTLED');
  const over = await pay(store, spaceId, { delegationId, amount: '20.01' });
  assert.equal(over.status, 'REJECTED');
  assert.ok(over.reasons.some((r) => /agent per-transaction cap/.test(r)), `got: ${over.reasons.join(' | ')}`);
});

test('M14-12: a delegation cannot pay a recipient the Space has not approved', async () => {
  const { store, spaceId } = setup({ spaceRules: { allowedCounterparties: [other] } });
  assert.throws(
    () => store.createDelegation(spec(spaceId, { delegationId: 'delegation-outside', allowedCounterparties: [vendor] })),
    /expands parent authority/,
  );
});

// --- humans are unaffected

test('M14-13: a human admin spends on a session, with no delegation required', async () => {
  const { store, spaceId } = setup();
  const result = await store.requestPayment({
    spaceId,
    actorId: founder.address,
    recipient: vendor,
    amount: '50.00',
  });
  assert.equal(result.status, 'SETTLED', `expected approval, got: ${result.reasons?.join(' | ')}`);
});

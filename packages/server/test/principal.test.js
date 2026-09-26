/**
 * Who is allowed to make a spending call.
 *
 * Two routes used to accept an `actorId` string in an unauthenticated body and
 * match it against `space.members[].name`. Anything that could reach the API —
 * or any process that could spawn the stdio MCP server — was a spending
 * principal the moment it learned a name.
 *
 * These tests pin the replacement: a wallet session, or a delegation the Space
 * owner signed. Nothing else gets through, and the refusals are specific
 * enough to act on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { start } from '../src/server.js';
import { signIn } from './helpers-auth.mjs';

const AGENT = 'ProcureBot';
const VENDOR = '0x1111111111111111111111111111111111111111';

let ctx;
let store;
let founder;
let agentWallet;
let cookie;

async function call(method, path, body, withCookie = true) {
  const res = await fetch(`${ctx.url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(withCookie && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

test.before(async () => {
  founder = privateKeyToAccount(generatePrivateKey());
  agentWallet = privateKeyToAccount(generatePrivateKey());
  store = new SpaceStore({ seed: false, settlement: async () => ({ txHash: `0x${'ab'.repeat(32)}`, receipt: { status: 1 } }) });
  ctx = await start({ port: 0, store });
  cookie = await signIn(ctx.url, founder);
});

test.after(() => {
  try { ctx.server.closeAllConnections?.(); ctx.server.close(); } catch { /* never started */ }
});

/** A Space whose agent holds a real signed delegation. */
async function seededSpace({ sign = true } = {}) {
  const space = store.createSpace({ name: `Gate ${Date.now()}`, actorId: founder.address });
  store.bindMemberAddress(space.id, founder.address, founder.address);
  store.addParticipant({ spaceId: space.id, kind: 'Agent', displayName: AGENT, address: agentWallet.address });
  store.fundSpace({ spaceId: space.id, amount: '1000.00', actorId: founder.address });
  // The Space approves the vendor first. A delegation cannot introduce a
  // counterparty the Space itself has not accepted.
  store.getSpace(space.id).rules.allowedCounterparties = [VENDOR];
  // Delegation ids are unique store-wide, and this helper builds several
  // Spaces, so the id is derived from the Space.
  const delegationId = `delegation-gate-${space.id}`;
  const created = store.createDelegation({
    spaceId: space.id,
    delegationId,
    parentActor: founder.address,
    child: agentWallet.address,
    parentRole: 'admin',
    childRole: 'agent',
    maxPerTransaction: '100.00',
    dailyBudget: '200.00',
    allowedCounterparties: [VENDOR],
    asset: 'USDC',
    chainId: space.chainId,
    nonce: '1',
    expiry: String(Math.floor(Date.now() / 1000) + 3600),
    policySnapshotHash: `0x${'0'.repeat(64)}`,
  });
  if (sign) {
    await store.signDelegation({
      spaceId: space.id,
      delegationId,
      parentActor: founder.address,
      signature: await founder.signTypedData(created.typedData),
    });
  }
  return space.id;
}

const payBody = (extra = {}) => ({ actorId: AGENT, recipient: VENDOR, amount: '50.00', ...extra });

// --- the unauthenticated path is closed

test('P1-1: a bare actorId with no session and no delegation is refused', async () => {
  const spaceId = await seededSpace();
  const res = await call('POST', `/api/spaces/${spaceId}/payments`, payBody(), false);
  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, 'AUTH_REQUIRED');
});

test('P1-2: the refusal names both ways in, so the caller knows what to do', async () => {
  const spaceId = await seededSpace();
  const res = await call('POST', `/api/spaces/${spaceId}/payments`, payBody(), false);
  assert.match(res.json.error.message, /sign in with a wallet/);
  assert.match(res.json.error.message, /delegationId/);
});

test('P1-3: naming an agent nobody delegated is not enough', async () => {
  const spaceId = await seededSpace();
  const res = await call('POST', `/api/spaces/${spaceId}/payments`, payBody({ delegationId: 'delegation-does-not-exist' }), false);
  assert.equal(res.status, 403);
  assert.equal(res.json.error.code, 'DELEGATION_REJECTED');
});

test('P1-4: an unsigned delegation is refused at the door', async () => {
  const spaceId = await seededSpace({ sign: false });
  const res = await call('POST', `/api/spaces/${spaceId}/payments`, payBody({ delegationId: `delegation-gate-${spaceId}` }), false);
  assert.equal(res.status, 403);
  assert.match(res.json.error.message, /has not been signed/);
});

test('P1-5: a revoked delegation is refused at the door', async () => {
  const spaceId = await seededSpace();
  store.revokeDelegation({ spaceId, delegationId: `delegation-gate-${spaceId}`, parentActor: founder.address });
  const res = await call('POST', `/api/spaces/${spaceId}/payments`, payBody({ delegationId: `delegation-gate-${spaceId}` }), false);
  assert.equal(res.status, 403);
  assert.match(res.json.error.message, /revoked/);
});

test('P1-6: an expired delegation is refused at the door', async () => {
  const spaceId = await seededSpace();
  const realNow = Date.now;
  Date.now = () => realNow() + 2 * 60 * 60 * 1000;
  try {
    const res = await call('POST', `/api/spaces/${spaceId}/payments`, payBody({ delegationId: `delegation-gate-${spaceId}` }), false);
    assert.equal(res.status, 403);
    assert.match(res.json.error.message, /expired/);
  } finally {
    Date.now = realNow;
  }
});

test('P1-7: a delegation from one Space cannot be presented to another', async () => {
  const spaceA = await seededSpace();
  const spaceB = store.createSpace({ name: 'Other Space', actorId: founder.address });
  store.bindMemberAddress(spaceB.id, founder.address, founder.address);
  // Signed and valid, but issued inside Space A and presented to Space B.
  const res = await call('POST', `/api/spaces/${spaceB.id}/payments`, payBody({ delegationId: `delegation-gate-${spaceA}` }), false);
  assert.equal(res.status, 403);
  assert.match(res.json.error.message, new RegExp(spaceA));
});

// --- and the two legitimate ways in still work

test('P1-8: a signed delegation lets the agent spend', async () => {
  const spaceId = await seededSpace();
  const res = await call('POST', `/api/spaces/${spaceId}/payments`, payBody({ delegationId: `delegation-gate-${spaceId}` }), false);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.status, 'SETTLED');
});

test('P1-9: a wallet session still works, with no delegation involved', async () => {
  const spaceId = await seededSpace();
  const res = await call('POST', `/api/spaces/${spaceId}/payments`, { actorId: founder.address, recipient: VENDOR, amount: '50.00' });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.status, 'SETTLED');
});

test('P1-10: the delegation does not buy more than it signed for', async () => {
  const spaceId = await seededSpace();
  const res = await call('POST', `/api/spaces/${spaceId}/payments`, payBody({ amount: '100.01', delegationId: `delegation-gate-${spaceId}` }), false);
  // It gets past the door and is stopped by policy, with a reason.
  assert.equal(res.status, 422);
  assert.ok(
    res.json.error.details.reasons.some((r) => /per-transaction cap/.test(r)),
    `expected a cap refusal, got: ${JSON.stringify(res.json.error.details.reasons)}`,
  );
});

// --- the work and escrow routes are gated the same way

test('P1-11: work escrow needs a principal too', async () => {
  const spaceId = await seededSpace();
  const res = await call('POST', `/api/spaces/${spaceId}/work`, {
    actorId: AGENT,
    provider: VENDOR,
    evaluator: AGENT,
    description: 'Unauthorised escrow',
    budget: '50.00',
    deadline: new Date(Date.now() + 86400000).toISOString(),
  }, false);
  assert.equal(res.status, 401);
  assert.equal(res.json.error.code, 'AUTH_REQUIRED');
});

test('P1-12: funding a Space needs a principal', async () => {
  const spaceId = await seededSpace();
  const res = await call('POST', `/api/spaces/${spaceId}/fund`, { amount: '100.00', actorId: AGENT }, false);
  assert.equal(res.status, 401);
});

test('P1-13: adding a participant needs a principal', async () => {
  const spaceId = await seededSpace();
  const res = await call('POST', `/api/spaces/${spaceId}/participants`, { kind: 'Agent', displayName: 'Sneaky' }, false);
  assert.equal(res.status, 401);
});

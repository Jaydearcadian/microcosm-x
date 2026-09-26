import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { start } from '../src/server.js';

const settlement = async () => ({ txHash: `0x${'cd'.repeat(32)}`, txHashes: { complete: `0x${'cd'.repeat(32)}` }, onchainJobId: 'gov-rest-test' });

async function request(base, method, path, body, cookie) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json().catch(() => ({})), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

async function session(base, account) {
  const challenge = await request(base, 'GET', `/api/auth/challenge?address=${account.address}`);
  const signature = await account.signMessage({ message: challenge.json.message });
  return (await request(base, 'POST', '/api/auth/session', { address: account.address, signature })).cookie;
}

test('M12-5: REST governance uses HttpOnly sessions and ignores body signer identity', async () => {
  const founder = privateKeyToAccount(generatePrivateKey());
  const signer1 = privateKeyToAccount(generatePrivateKey());
  const signer2 = privateKeyToAccount(generatePrivateKey());
  const outsider = privateKeyToAccount(generatePrivateKey());
  const store = new SpaceStore({ settlement });
  const ctx = await start({ port: 0, store });
  try {
    const founderCookie = await session(ctx.url, founder);
    const createdSpace = await request(ctx.url, 'POST', '/api/spaces', { name: 'Governance Space', actorId: founder.address }, founderCookie);
    const spaceId = createdSpace.json.space.id;
    const funded = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/fund`, { amount: '5000.00', actorId: founder.address.toLowerCase() }, founderCookie);
    assert.equal(funded.status, 200);
    const configured = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/governance/config`, { threshold: 2, signerAllowlist: [signer1.address, signer2.address, '0x3333333333333333333333333333333333333333'], actorAddress: outsider.address }, founderCookie);
    assert.equal(configured.status, 200);
    assert.equal(configured.json.governance.threshold, 2);
    const signer1Cookie = await session(ctx.url, signer1);
    const signer2Cookie = await session(ctx.url, signer2);
    const outsiderCookie = await session(ctx.url, outsider);
    // The recipient is named as a participant first so it is an approved
    // counterparty. A payment to an unapproved recipient is now refused at
    // request time, which is correct and is covered by SPACE-9; without this the
    // request would 409 and this test, which is about governance and session
    // handling rather than the allowlist, could not run at all.
    await request(ctx.url, 'POST', `/api/spaces/${spaceId}/participants`, { kind: 'Service', displayName: 'Payee', address: '0x1111111111111111111111111111111111111111', actorId: founder.address.toLowerCase() }, founderCookie);
    const created = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/governance/payments`, { requesterAddress: outsider.address, recipient: '0x1111111111111111111111111111111111111111', amount: '900.00', deadline: new Date(Date.now() + 86400000).toISOString() }, founderCookie);
    assert.equal(created.status, 201);
    assert.equal(created.json.request.requesterAddress, founder.address.toLowerCase());
    const requestId = created.json.request.requestId;
    const firstSignature = await signer1.signTypedData(created.json.typedData);
    const first = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/governance/requests/${requestId}/sign`, { signerAddress: signer2.address, signature: firstSignature }, signer1Cookie);
    assert.equal(first.status, 200);
    assert.equal(first.json.request.approvals[0].signerAddress, signer1.address.toLowerCase());
    const duplicate = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/governance/requests/${requestId}/sign`, { signature: firstSignature }, signer1Cookie);
    assert.equal(duplicate.status, 409);
    const foreignSignature = await outsider.signTypedData(created.json.typedData);
    const unauthorized = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/governance/requests/${requestId}/sign`, { signature: foreignSignature }, outsiderCookie);
    assert.equal(unauthorized.status, 403);
    const secondSignature = await signer2.signTypedData(created.json.typedData);
    const second = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/governance/requests/${requestId}/sign`, { signature: secondSignature }, signer2Cookie);
    assert.equal(second.status, 200);
    const executed = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/governance/requests/${requestId}/execute`, { actorAddress: outsider.address }, founderCookie);
    assert.equal(executed.status, 200);
    assert.equal(executed.json.status, 'EXECUTED');
    assert.equal(executed.json.request.receipt.governanceRequestId, requestId);
  } finally {
    ctx.server.closeAllConnections?.();
    ctx.server.close();
  }
});

test('M13-1: an admin can set the Space spending limits and see what changed', async () => {
  const store = new SpaceStore();
  const space = store.createSpace({ name: 'Limits Space', actorId: 'founder-01' });
  const admin = { id: 'founder-01', name: 'Founder', role: 'admin', address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' };
  store.spaces.get(space.id).members = [admin];

  const result = store.configureSpaceLimits({
    spaceId: space.id,
    actorAddress: admin.address,
    maxPerTransaction: '250.00',
    dailyBudget: '900.00',
  });

  // the operator's own figure is kept, not the six-decimal re-render
  assert.equal(result.rules.maxPerTransaction, '250.00');
  assert.equal(result.rules.dailyBudget, '900.00');
  assert.deepEqual(result.changed, [
    'maxPerTransaction: 500.00 -> 250.00',
    'dailyBudget: 2000.00 -> 900.00',
  ]);
  // and the policy engine now enforces the new numbers
  const { evaluateSpacePayment } = await import('../../policy-engine/src/index.js');
  const verdict = evaluateSpacePayment(store.getSpace(space.id), {
    actionId: 'act-limits', actorId: 'founder-01',
    recipient: store.getSpace(space.id).rules.allowedCounterparties[0],
    amount: '400.00', asset: 'USDC',
  });
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.reasons.some((r) => /per-transaction cap/.test(r)));
});

test('M13-1: a non-admin cannot loosen the limits', () => {
  const store = new SpaceStore();
  const space = store.createSpace({ name: 'Limits Guard', actorId: 'founder-01' });
  assert.throws(
    () => store.configureSpaceLimits({ spaceId: space.id, actorAddress: '0x1111111111111111111111111111111111111111', maxPerTransaction: '99999.00' }),
    /Only an admin/,
  );
});

test('M13-1: a nonsense amount is rejected rather than silently coerced', () => {
  const store = new SpaceStore();
  const space = store.createSpace({ name: 'Limits Guard 2', actorId: 'founder-01' });
  const admin = { id: 'founder-01', name: 'Founder', role: 'admin', address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' };
  store.spaces.get(space.id).members = [admin];
  assert.throws(() => store.configureSpaceLimits({ spaceId: space.id, actorAddress: admin.address, maxPerTransaction: 'lots' }), /amount like 250.00/);
  assert.throws(() => store.configureSpaceLimits({ spaceId: space.id, actorAddress: admin.address, dailyBudget: '-5' }), /non-negative amount/);
});

test('M13-1: a budget binding is recorded and readable back', () => {
  const store = new SpaceStore();
  const space = store.createSpace({ name: 'Binding Space', actorId: 'founder-01' });
  const admin = { id: 'founder-01', name: 'Founder', role: 'admin', address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8' };
  store.spaces.get(space.id).members = [admin];

  assert.equal(store.getBudgetBinding({ spaceId: space.id }), null);
  const binding = store.recordBudgetBinding({
    spaceId: space.id, actorAddress: admin.address,
    signature: '0xdeadbeef', message: 'Microcosm budget binding',
    maxPerTransaction: '250.00', dailyBudget: '900.00',
  });
  assert.equal(binding.maxPerTransaction, '250.00');
  assert.ok(binding.boundAt);
  assert.deepEqual(store.getBudgetBinding({ spaceId: space.id }), binding);
  // and it is auditable rather than silent
  const trail = store.getActivity(space.id).filter((entry) => entry.type === 'BUDGET_BOUND');
  assert.equal(trail.length, 1);
  assert.equal(trail[0].dailyBudget, '900.00');
});

test('M13-1: a checksummed wallet address can fund the Space it owns', () => {
  // Wallets hand back a checksummed address. The admin check used `m.id ===
  // actorId`, so the owner of a Space could not fund it, and nothing caught it
  // because every address in the fixtures is lowercase.
  const store = new SpaceStore();
  const lower = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
  const checksummed = '0x70997970C51812dc3A010c7d01B50e0D17dC79C8';
  const space = store.createSpace({ name: 'Case Space', actorId: lower });
  store.fundSpace({ spaceId: space.id, amount: '100.00', actorId: lower });

  // the same wallet, checksummed, is the same person
  const after = store.fundSpace({ spaceId: space.id, amount: '50.00', actorId: checksummed });
  assert.equal(Number(after.balance), 150, 'the checksummed address funded the Space it owns');
});

test('M13-1: a non-member still cannot fund a Space', () => {
  const store = new SpaceStore();
  const space = store.createSpace({ name: 'Case Guard', actorId: 'founder-01' });
  assert.throws(
    () => store.fundSpace({ spaceId: space.id, amount: '10.00', actorId: '0x1111111111111111111111111111111111111111' }),
    /is not an admin/,
  );
});

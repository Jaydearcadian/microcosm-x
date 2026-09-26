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

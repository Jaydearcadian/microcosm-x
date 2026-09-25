import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { start } from '../../server/src/server.js';
import { SpaceClient } from '../src/client.js';

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

test('M10-9: SDK exposes the same authenticated delegation lifecycle as MCP and REST', async () => {
  const founder = privateKeyToAccount(generatePrivateKey());
  const store = new SpaceStore({ seed: false });
  const ctx = await start({ port: 0, store });
  try {
    const cookie = await session(ctx.url, founder);
    const client = new SpaceClient(ctx.url, { cookie });
    const space = (await client.createSpace({ name: 'SDK Delegation Space', actorId: founder.address })).space;
    await client.addParticipant(space.id, { kind: 'Agent', displayName: 'Child Agent', address: child.address });
    store.getSpace(space.id).rules.allowedCounterparties = [vendor];
    const message = {
      delegationId: 'delegation-sdk-1',
      child: child.address,
      childRole: 'agent',
      maxPerTransaction: '100.00',
      dailyBudget: '200.00',
      allowedCounterparties: [vendor],
      asset: 'USDC',
      chainId: 1952,
      nonce: '1',
      expiry: String(Math.floor(Date.now() / 1000) + 3600),
      policySnapshotHash: `0x${'1'.repeat(64)}`,
    };
    const created = await client.createDelegation(space.id, message);
    assert.equal(created.delegation.status, 'PENDING');
    const signature = await founder.signTypedData(created.typedData);
    assert.equal((await client.signDelegation(space.id, 'delegation-sdk-1', { signature })).delegation.status, 'SIGNED');
    assert.equal((await client.verifyDelegation(space.id, 'delegation-sdk-1')).verification.valid, true);
    assert.equal((await client.listDelegations(space.id)).delegations.length, 1);
    assert.equal((await client.revokeDelegation(space.id, 'delegation-sdk-1')).delegation.status, 'REVOKED');
  } finally {
    ctx.server.closeAllConnections?.();
    ctx.server.close();
  }
});

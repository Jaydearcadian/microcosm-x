import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey } from 'viem/accounts';
import { privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { start } from '../src/server.js';

async function request(base, method, path, body, cookie) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json();
  return { response, json, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

test('wallet session authenticates an address and supports Space invitations', async () => {
  const founder = privateKeyToAccount(generatePrivateKey());
  const invitee = privateKeyToAccount(generatePrivateKey());
  const ctx = await start({ port: 0, store: new SpaceStore() });
  try {
    const challenge = await request(ctx.url, 'GET', `/api/auth/challenge?address=${founder.address}`);
    assert.equal(challenge.response.status, 200);
    const signature = await founder.signMessage({ message: challenge.json.message });
    const authenticated = await request(ctx.url, 'POST', '/api/auth/session', { address: founder.address, signature });
    assert.equal(authenticated.response.status, 200);
    assert.equal(authenticated.json.authenticated, true);
    const founderCookie = authenticated.cookie;
    assert.ok(founderCookie);

    const created = await request(ctx.url, 'POST', '/api/spaces', { name: 'Authenticated Space', actorId: founder.address }, founderCookie);
    assert.equal(created.response.status, 201);
    const spaceId = created.json.space.id;

    const invitation = await request(ctx.url, 'POST', `/api/spaces/${spaceId}/invitations`, { role: 'member', displayName: 'Invited Operator' }, founderCookie);
    assert.equal(invitation.response.status, 201);
    assert.equal(invitation.json.invitation.address, null);
    const code = invitation.json.invitation.code;

    const inviteeChallenge = await request(ctx.url, 'GET', `/api/auth/challenge?address=${invitee.address}`);
    const inviteeSignature = await invitee.signMessage({ message: inviteeChallenge.json.message });
    const inviteeSession = await request(ctx.url, 'POST', '/api/auth/session', { address: invitee.address, signature: inviteeSignature });
    const inviteeCookie = inviteeSession.cookie;
    const redeemed = await request(ctx.url, 'POST', '/api/auth/invitations/redeem', { code }, inviteeCookie);
    assert.equal(redeemed.response.status, 200);
    assert.equal(redeemed.json.space.members.some((member) => member.address === invitee.address.toLowerCase()), true);

    const spaces = await request(ctx.url, 'GET', `/api/spaces?actorId=${invitee.address}`, undefined, inviteeCookie);
    assert.equal(spaces.json.spaces.some((space) => space.id === spaceId), true);
  } finally {
    ctx.server.closeAllConnections?.();
    ctx.server.close();
  }
});

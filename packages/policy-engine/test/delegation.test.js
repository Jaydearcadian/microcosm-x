import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { authorityDelegationDigest, authorityDelegationTypedData, authorityIsSubset, authoritySubsetProof, validateAuthorityDelegation, verifyAuthorityDelegationSignature } from '../src/delegation.js';

const signer = privateKeyToAccount(generatePrivateKey());
const child = '0x1111111111111111111111111111111111111111';
const counterpartyA = '0x2222222222222222222222222222222222222222';
const counterpartyB = '0x3333333333333333333333333333333333333333';
const counterpartyC = '0x4444444444444444444444444444444444444444';
const EXPIRY = String(Math.floor(Date.now() / 1000) + 3600);

function delegation(overrides = {}) {
  return {
    delegationId: 'delegation-1',
    spaceId: 'space-1',
    parentActor: signer.address,
    child,
    parentRole: 'admin',
    childRole: 'agent',
    maxPerTransaction: '100.000000',
    dailyBudget: '250.000000',
    allowedCounterparties: [counterpartyA, counterpartyB, counterpartyC],
    asset: 'USDC',
    chainId: 1952,
    nonce: '1',
    expiry: EXPIRY,
    policySnapshotHash: `0x${'1'.repeat(64)}`,
    ...overrides,
  };
}

test('M10-1: AuthorityDelegation typed data binds every authority field and chain', () => {
  const message = delegation();
  const typed = authorityDelegationTypedData(message);
  assert.equal(typed.primaryType, 'AuthorityDelegation');
  assert.equal(typed.domain.chainId, 1952);
  assert.equal(typed.types.AuthorityDelegation.length, 14);
  assert.notEqual(authorityDelegationDigest(message), authorityDelegationDigest({ ...message, maxPerTransaction: '100.000001' }));
  assert.notEqual(authorityDelegationDigest(message), authorityDelegationDigest(message, 1));
  assert.equal(validateAuthorityDelegation(message).valid, true);
});

test('M10-2: 2-of-3 subset proof and exact cap, budget, counterparty attenuation', () => {
  const parent = delegation();
  const valid = delegation({ delegationId: 'delegation-2', nonce: '2', maxPerTransaction: '99.000000', dailyBudget: '250.000000', allowedCounterparties: [counterpartyA, counterpartyB] });
  assert.equal(authorityIsSubset(parent, valid), true);
  const proof = authoritySubsetProof(parent, valid);
  assert.equal(proof.valid, true);
  assert.notEqual(proof.parentDigest, proof.childDigest);
  assert.equal(authorityIsSubset(parent, delegation({ delegationId: 'delegation-3', maxPerTransaction: '100.000002' })), false);
  assert.equal(authorityIsSubset(parent, delegation({ delegationId: 'delegation-4', dailyBudget: '250.000001' })), false);
  assert.equal(authorityIsSubset(parent, delegation({ delegationId: 'delegation-5', allowedCounterparties: [counterpartyA, '0x5555555555555555555555555555555555555555'] })), false);
});

test('M10-3: role escalation, wrong asset and chain, expiry, malformed addresses, and non-positive limits reject', () => {
  const parent = delegation();
  const agentParent = delegation({ parentRole: 'agent' });
  assert.equal(authorityIsSubset(agentParent, delegation({ parentRole: 'agent', childRole: 'operator' })), false);
  assert.equal(authorityIsSubset(parent, delegation({ asset: 'USDT' })), false);
  assert.equal(authorityIsSubset(parent, delegation({ chainId: 1 })), false);
  assert.equal(validateAuthorityDelegation(delegation({ expiry: '1' })).valid, false);
  assert.equal(validateAuthorityDelegation(delegation({ parentActor: 'not-an-address' })).valid, false);
  assert.equal(validateAuthorityDelegation(delegation({ maxPerTransaction: '0' })).valid, false);
  assert.equal(validateAuthorityDelegation(delegation({ dailyBudget: '-1' })).valid, false);
});

test('M10-4: exact parent signature verification rejects wrong signer and tamper', async () => {
  const message = delegation();
  const signature = await signer.signTypedData(authorityDelegationTypedData(message));
  const valid = await verifyAuthorityDelegationSignature({ delegation: message, signature, signerAddress: signer.address });
  assert.equal(valid.valid, true);
  await assert.rejects(() => verifyAuthorityDelegationSignature({ delegation: message, signature, signerAddress: child }), /does not match parentActor/);
  await assert.rejects(() => verifyAuthorityDelegationSignature({ delegation: { ...message, dailyBudget: '1' }, signature, signerAddress: signer.address }), /signature does not match/);
  await assert.rejects(() => verifyAuthorityDelegationSignature({ delegation: message, signature, signerAddress: signer.address, digest: `0x${'2'.repeat(64)}` }), /tampered/);
});

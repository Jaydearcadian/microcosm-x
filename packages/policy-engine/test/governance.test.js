import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { governanceApprovalTypedData, governancePaymentDigest, validateGovernanceApproval } from '../src/governance.js';

const signer = privateKeyToAccount(generatePrivateKey());
const message = {
  requestId: 'gov-1',
  spaceId: 'space-1',
  recipient: '0x1111111111111111111111111111111111111111',
  amount: '900000000',
  asset: 'USDC',
  memo: 'approved high-value payment',
  nonce: '11',
  deadline: '4102444800',
  policyHash: `0x${'1'.repeat(64)}`,
};
const chainId = 1952;

test('M12-1: EIP-712 governance digest binds the full approval message', () => {
  const digest = governancePaymentDigest(message, chainId);
  const typedData = governanceApprovalTypedData(message, chainId);
  assert.equal(typedData.domain.chainId, 1952);
  assert.equal(typedData.types.GovernancePaymentApproval.length, 9);
  assert.notEqual(digest, governancePaymentDigest({ ...message, amount: '900000001' }, chainId));
  assert.notEqual(digest, governancePaymentDigest(message, 1));
});

test('M12-2: EIP-712 rejects tampered, expired, and invalid-signature approvals', async () => {
  const signature = await signer.signTypedData(governanceApprovalTypedData(message, chainId));
  const valid = await validateGovernanceApproval({ approval: { signerAddress: signer.address, signature, digest: governancePaymentDigest(message, chainId) }, request: { approval: message }, chainId, signerAllowlist: [signer.address] });
  assert.equal(valid.valid, true);
  const tampered = await validateGovernanceApproval({ approval: { signerAddress: signer.address, signature, digest: `0x${'2'.repeat(64)}` }, request: { approval: message }, chainId, signerAllowlist: [signer.address] });
  assert.equal(tampered.valid, false);
  assert.ok(tampered.reasons.some((reason) => reason.includes('tampered')));
  const expired = await validateGovernanceApproval({ approval: { signerAddress: signer.address, signature, digest: governancePaymentDigest(message, chainId) }, request: { approval: { ...message, deadline: '1' } }, chainId, signerAllowlist: [signer.address] });
  assert.equal(expired.valid, false);
  assert.ok(expired.reasons.some((reason) => reason.includes('expired') || reason.includes('signature')));
  const foreign = await validateGovernanceApproval({ approval: { signerAddress: '0x2222222222222222222222222222222222222222', signature, digest: governancePaymentDigest(message, chainId) }, request: { approval: message }, chainId, signerAllowlist: [signer.address] });
  assert.equal(foreign.valid, false);
  assert.ok(foreign.reasons.some((reason) => reason.includes('not authorized')));
});

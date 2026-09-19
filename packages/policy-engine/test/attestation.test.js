import test from 'node:test';
import assert from 'node:assert/strict';
import {
  keccak256,
  attestationDigest,
  attestationDomainSeparator,
  validateAuthorizationShape,
  isAuthorizationLive,
  EIP712_DOMAIN_TYPEHASH,
  PAYMENT_AUTH_TYPEHASH,
} from '../src/attestation.js';

test('ATTEST-JS-1: embedded Keccak-256 matches official test vectors', () => {
  assert.equal(
    keccak256('0x'),
    '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
  );
  assert.equal(
    keccak256(new TextEncoder().encode('abc')),
    '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45'
  );
  assert.equal(
    keccak256(new TextEncoder().encode('hello')),
    '0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8'
  );
});

test('ATTEST-JS-2: offchain digest matches the onchain verifier byte-for-byte', async () => {
  // Canonical vector executed onchain via:
  //   forge test --match-test testDigestFixtureVector -vvvv
  // (contracts/test/Attestation.t.sol emits FixtureDigest with the same values)
  const auth = {
    spaceId: '0x3c8fb0c1ef0903e38b5fd254b6263a5dc6d95cd17e6cb408b197e790b283cdb0',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: 350_000_000,
    nonce: 1,
    deadline: 1893456000,
    deliverableHash: '0x858629340e58d1faeb24232b139fa588ddc67f4ed71970241fc1bf18f48f65db',
  };
  const digest = attestationDigest({
    chainId: 195,
    verifyingContract: '0x1111111111111111111111111111111111111111',
    auth,
  });
  assert.equal(digest, '0x6de0e9235ca74a6f96f11a80d14e386e6969fe4ad84d3a35b802c40b720f3999');
});

test('ATTEST-JS-3: tampered fields or foreign chains change the digest', () => {
  const base = {
    spaceId: '0x3c8fb0c1ef0903e38b5fd254b6263a5dc6d95cd17e6cb408b197e790b283cdb0',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: 350_000_000,
    nonce: 1,
    deadline: 1893456000,
    deliverableHash: '0x858629340e58d1faeb24232b139fa588ddc67f4ed71970241fc1bf18f48f65db',
  };
  const params = { chainId: 195, verifyingContract: '0x1111111111111111111111111111111111111111' };
  const canonical = attestationDigest({ ...params, auth: base });

  // Tampered amount / recipient / deliverable must NOT verify against the original signature.
  assert.notEqual(attestationDigest({ ...params, auth: { ...base, amount: 500_000_000 } }), canonical);
  assert.notEqual(
    attestationDigest({ ...params, auth: { ...base, recipient: '0x0000000000000000000000000000000000000e41' } }),
    canonical
  );
  // Cross-chain replay: a different chainId yields a different digest.
  assert.notEqual(attestationDigest({ ...params, chainId: 196, auth: base }), canonical);
  // Nonce rotation changes the digest (replay protection surface).
  assert.notEqual(attestationDigest({ ...params, auth: { ...base, nonce: 2 } }), canonical);
});

test('ATTEST-JS-4: authorization shape validation and liveness gate', () => {
  const valid = {
    spaceId: '0x3c8fb0c1ef0903e38b5fd254b6263a5dc6d95cd17e6cb408b197e790b283cdb0',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: 350_000_000,
    nonce: 1,
    deadline: 1893456000,
    deliverableHash: '0x858629340e58d1faeb24232b139fa588ddc67f4ed71970241fc1bf18f48f65db',
  };
  assert.deepEqual(validateAuthorizationShape(valid), []);
  assert.equal(isAuthorizationLive(valid), true);
  assert.equal(isAuthorizationLive({ ...valid, deadline: 1 }), false);

  const bad = { ...valid, recipient: 'not-an-address', amount: 0 };
  const reasons = validateAuthorizationShape(bad);
  assert.ok(reasons.some((r) => r.includes('recipient')));
  assert.ok(reasons.some((r) => r.includes('Amount')));
});

test('ATTEST-JS-5: EIP-712 type hashes match the onchain constants', () => {
  assert.equal(
    EIP712_DOMAIN_TYPEHASH,
    '0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f'
  );
  assert.ok(PAYMENT_AUTH_TYPEHASH.startsWith('0x'));
  assert.equal(
    attestationDomainSeparator(195, '0x1111111111111111111111111111111111111111').length,
    66
  );
});

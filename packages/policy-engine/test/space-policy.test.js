import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSpacePayment, toBaseUnits, fromBaseUnits } from '../src/index.js';

const mockSpace = {
  id: 'space-procurement-001',
  name: 'Autonomous Procurement Space',
  balance: '5000.00',
  currency: 'USDC',
  totalSpentToday: '0.00',
  members: [
    { id: 'human-admin-01', role: 'admin', name: 'Treasury Admin' },
    { id: 'agent-procure-01', role: 'agent', name: 'Purchasing Agent' },
    { id: 'viewer-01', role: 'viewer', name: 'Observer' },
  ],
  rules: {
    maxPerTransaction: '500.00',
    dailyBudget: '2000.00',
    allowedCounterparties: [
      '0x1111111111111111111111111111111111111111', // CloudCompute Corp
      '0x2222222222222222222222222222222222222222', // Dataset Provider
      'cloudcompute.eth',
    ],
  },
};

test('SPACE-1: Valid compliant payment within rules is approved', () => {
  const request = {
    actionId: 'act-001',
    actorId: 'agent-procure-01',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '350.00',
    asset: 'USDC',
    memo: 'GPU cluster hours for training',
  };

  const result = evaluateSpacePayment(mockSpace, request);
  assert.equal(result.allowed, true);
  assert.equal(result.reasons.length, 0);
  assert.ok(result.approvedIntent);
  assert.equal(result.approvedIntent.amount, '350.00');
  assert.equal(result.approvedIntent.recipient, '0x1111111111111111111111111111111111111111');
  assert.ok(result.approvedIntent.authHash.startsWith('0x'));
});

test('SPACE-2: Out-of-policy request exceeding per-transaction cap is rejected with DenialProof', () => {
  const request = {
    actionId: 'act-002',
    actorId: 'agent-procure-01',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '900.00', // Exceeds $500 cap
    asset: 'USDC',
    memo: 'Unauthorized workstation purchase',
  };

  const result = evaluateSpacePayment(mockSpace, request);
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.some((r) => r.includes('Exceeds Space per-transaction cap')));
  assert.ok(result.denialProof);
  assert.equal(result.denialProof.spaceId, 'space-procurement-001');
  assert.equal(result.denialProof.actorId, 'agent-procure-01');
  assert.equal(result.denialProof.requestedAmount, '900.00');
  assert.ok(result.denialProof.proofHash.startsWith('0x'));
});

test('SPACE-3: Strict boundary test ($500.00 exact passes, $500.01 fails)', () => {
  const requestExact = {
    actionId: 'act-exact',
    actorId: 'agent-procure-01',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '500.00',
    asset: 'USDC',
  };
  const resultExact = evaluateSpacePayment(mockSpace, requestExact);
  assert.equal(resultExact.allowed, true);

  const requestOver = {
    actionId: 'act-over',
    actorId: 'agent-procure-01',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '500.01',
    asset: 'USDC',
  };
  const resultOver = evaluateSpacePayment(mockSpace, requestOver);
  assert.equal(resultOver.allowed, false);
  assert.ok(resultOver.reasons.some((r) => r.includes('Exceeds Space per-transaction cap')));
});

test('SPACE-4: Payment to unapproved counterparty is rejected', () => {
  const request = {
    actionId: 'act-unapproved',
    actorId: 'agent-procure-01',
    recipient: '0x9999999999999999999999999999999999999999', // Unknown recipient
    amount: '100.00',
    asset: 'USDC',
  };

  const result = evaluateSpacePayment(mockSpace, request);
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.some((r) => r.includes('approved counterparties')));
  assert.ok(result.denialProof);
});

test('SPACE-5: Payment exceeding daily budget is rejected', () => {
  const spaceNearBudget = {
    ...mockSpace,
    totalSpentToday: '1800.00', // daily budget is 2000.00
  };

  const request = {
    actionId: 'act-daily',
    actorId: 'agent-procure-01',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '300.00', // 1800 + 300 = 2100 > 2000
    asset: 'USDC',
  };

  const result = evaluateSpacePayment(spaceNearBudget, request);
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.some((r) => r.includes('Exceeds Space daily budget')));
});

test('SPACE-6: Unauthorized actor role (viewer) cannot request funds', () => {
  const request = {
    actionId: 'act-viewer',
    actorId: 'viewer-01', // role is viewer
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '50.00',
    asset: 'USDC',
  };

  const result = evaluateSpacePayment(mockSpace, request);
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.some((r) => r.includes('no spending authority')));
});

test('SPACE-7: Unknown actor not in Space is rejected', () => {
  const request = {
    actionId: 'act-stranger',
    actorId: 'stranger-danger',
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '50.00',
    asset: 'USDC',
  };

  const result = evaluateSpacePayment(mockSpace, request);
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.some((r) => r.includes('not an authorized member')));
});

test('Unit conversions preserve 6-decimal precision without rounding error', () => {
  assert.equal(toBaseUnits('500'), 500000000n);
  assert.equal(toBaseUnits('500.00'), 500000000n);
  assert.equal(toBaseUnits('0.000001'), 1n);
  assert.equal(fromBaseUnits(500000000n), '500.000000');
  assert.equal(fromBaseUnits(1n), '0.000001');
});

test('SPACE-9: an empty counterparty allowlist denies every payment rather than allowing them', () => {
  // The guard on this check also required `length > 0`, so an empty allowlist
  // skipped the check entirely. Every Space created through the API seeds an
  // empty list, which meant a fresh Space could pay any address at all. That is
  // the one boundary this product exists to hold, so the empty case now denies.
  const space = {
    ...mockSpace,
    rules: { ...mockSpace.rules, allowedCounterparties: [] },
  };
  const result = evaluateSpacePayment(space, {
    actionId: 'act-empty-allowlist',
    actorId: 'agent-procure-01',
    recipient: '0x9999999999999999999999999999999999999999',
    amount: '100.00',
    asset: 'USDC',
  });

  assert.equal(result.allowed, false);
  assert.ok(
    result.reasons.some((reason) => /approved no counterparties yet/.test(reason)),
    `expected an explicit empty-allowlist refusal, got ${JSON.stringify(result.reasons)}`,
  );
  assert.ok(result.denialProof, 'a refusal must still carry a denial proof');
  // money must not have moved
  assert.notEqual(result.denialProof.status, 'ALLOWED');
});

test('SPACE-9: an omitted allowlist key is still an explicit opt-out', () => {
  // Distinct from the empty case on purpose: a Space that never mentions
  // counterparties has opted out of the rule, and saying so has to stay
  // possible or the deny-by-default cannot be adopted safely.
  const rules = { ...mockSpace.rules };
  delete rules.allowedCounterparties;
  const space = { ...mockSpace, rules };
  const result = evaluateSpacePayment(space, {
    actionId: 'act-no-allowlist-key',
    actorId: 'agent-procure-01',
    recipient: '0x9999999999999999999999999999999999999999',
    amount: '100.00',
    asset: 'USDC',
  });

  assert.ok(!result.reasons.some((reason) => /counterpart/.test(reason)), `the rule should be skipped, got ${JSON.stringify(result.reasons)}`);
});

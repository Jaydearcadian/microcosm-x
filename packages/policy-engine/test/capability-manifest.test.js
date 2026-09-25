import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityManifest } from '../src/index.js';

const sensitiveSpace = {
  id: 'space-1',
  name: 'Manifest Space',
  network: 'OKX X Layer Testnet',
  chainId: 1952,
  currency: 'USDC',
  balance: '5000.00',
  totalSpentToday: '12.00',
  members: [{ id: 'agent-1', address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
  sessions: [{ token: 'secret' }],
  rules: {
    maxPerTransaction: '500.00',
    dailyBudget: '2000.00',
    allowedCounterparties: ['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
    schedule: { days: ['mon'] },
  },
  x402: { secret: 'not-published' },
};

test('M14-POLICY-1: capability manifest is deterministic and sanitized', () => {
  const first = createCapabilityManifest(sensitiveSpace);
  const second = createCapabilityManifest(sensitiveSpace);
  assert.deepEqual(first, second);
  assert.equal(first.schema, 'microcosm.space.capability-manifest/v1');
  assert.deepEqual(first.space, { id: 'space-1', name: 'Manifest Space', network: 'OKX X Layer Testnet', chainId: 1952, currency: 'USDC' });
  assert.deepEqual(first.capabilities, {
    payment: { id: 'payment' },
    work: { id: 'work' },
    request: { id: 'request' },
    court: { id: 'court' },
  });
  assert.deepEqual(first.policy, {
    maxPerTransaction: '500.00',
    dailyBudget: '2000.00',
    allowlist: { type: 'counterparties', enabled: true },
  });
  const serialized = JSON.stringify(first);
  for (const secret of ['5000.00', '12.00', 'secret', 'not-published', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'schedule']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

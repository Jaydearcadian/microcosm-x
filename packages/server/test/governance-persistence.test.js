import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { load, save } from '../src/persist.js';

const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'm12-')), 'snapshot.json');

test('M12-6: governance queue, approvals, and execution state persist and legacy snapshots load', async () => {
  const signer = privateKeyToAccount(generatePrivateKey());
  const store = new SpaceStore({ settlement: async () => ({ txHash: `0x${'ef'.repeat(32)}`, txHashes: { complete: `0x${'ef'.repeat(32)}` }, onchainJobId: 'gov-persist' }) });
  store.configureSpaceGovernance({ spaceId: 'space-procurement-001', actorAddress: '0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367', threshold: 1, signerAllowlist: [signer.address] });
  const created = store.createGovernancePaymentRequest({ spaceId: 'space-procurement-001', requesterAddress: '0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367', recipient: '0x1111111111111111111111111111111111111111', amount: '900.00', deadline: new Date(Date.now() + 86400000).toISOString() });
  await store.signGovernancePaymentRequest({ spaceId: 'space-procurement-001', requestId: created.request.requestId, signerAddress: signer.address, signature: await signer.signTypedData(created.typedData) });
  const path = file();
  save(store, path);
  const revived = new SpaceStore();
  assert.equal(load(revived, path), true);
  assert.deepEqual(revived.getGovernanceRequest({ spaceId: 'space-procurement-001', requestId: created.request.requestId }), store.getGovernanceRequest({ spaceId: 'space-procurement-001', requestId: created.request.requestId }));
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  delete raw.governanceRequests;
  delete raw.counters.governanceRequest;
  fs.writeFileSync(path, JSON.stringify(raw));
  const legacy = new SpaceStore();
  assert.equal(load(legacy, path), true);
  assert.equal(legacy.governanceRequests.size, 0);
});

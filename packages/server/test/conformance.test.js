/**
 * REST conformance leg (Slice 9): the same business loop as the MCP suite —
 * create Space → participants → request → accept → work → submit → evaluate
 * → payment → denial → activity — over HTTP with identical terminal states.
 * Any MCP/REST divergence is a P0 defect.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { start } from '../src/server.js';
import { ensureChain } from '../../../mcp/test/helpers/chain.mjs';
import { XLayerAdapter } from '../../../mcp/src/xlayer.js';

const FOUNDER = 'Ada Founder';
// Onchain-backed operator identities (member records carry real addresses;
// settlement resolves display ids to these for the chain calls).
let OP;
let VENDOR;

let base;
let ctx;
let chain;
let adapter;

async function api(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

test.before(async () => {
  chain = await ensureChain({ port: 18546 });
  adapter = new XLayerAdapter();
  OP = chain.addrs.deployer;
  VENDOR = chain.addrs.provider;
  ctx = await start({ port: 0, store: new SpaceStore() });
  base = ctx.url;
});

test.after(async () => {
  try { ctx.server.closeAllConnections?.(); ctx.server.close(); } catch { /* never started */ }
  if (chain) await chain.cleanup();
});

test('M3-1: health + space lifecycle (create → fund → bounds)', async () => {
  const health = await api('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);

  const created = await api('POST', '/api/spaces', { name: 'Conformance Space', actorId: FOUNDER, chainId: chain.chainId });
  assert.equal(created.status, 201);
  const spaceId = created.json.space.id;
  assert.ok(spaceId.startsWith('space-'));
  ctx.spaceId = spaceId;

  // Onchain-backed operator roster (live settlement resolves these).
  const op = await api('POST', `/api/spaces/${spaceId}/participants`, { kind: 'Agent', displayName: 'TreasuryOp', address: OP });
  assert.equal(op.status, 201);
  const vendor = await api('POST', `/api/spaces/${spaceId}/participants`, { kind: 'Counterparty', displayName: 'VendorBot', address: VENDOR });
  assert.equal(vendor.status, 201);

  const funded = await api('POST', `/api/spaces/${spaceId}/fund`, { amount: '5000.00', actorId: FOUNDER });
  assert.equal(funded.status, 200);
  assert.equal(funded.json.space.balance, '5000.000000');

  const bounds = await api('GET', `/api/spaces/${spaceId}/bounds`);
  assert.equal(bounds.status, 200);
  assert.equal(bounds.json.treasuryBalance, '5000.000000');
  assert.equal(bounds.json.remaining, '2000.000000');
  assert.equal(bounds.json.denials, 0);

  const missing = await api('GET', '/api/spaces/space-nope');
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error.code, 'NOT_FOUND');
});

test('M3-2: participants + request lifecycle (create → accept → receive → trace)', async () => {
  const { spaceId } = ctx;
  const agent = await api('POST', `/api/spaces/${spaceId}/participants`, { kind: 'Agent', displayName: 'ConformanceBot' });
  assert.equal(agent.status, 201);

  const badKind = await api('POST', `/api/spaces/${spaceId}/participants`, { kind: 'Ghost', displayName: 'X' });
  assert.equal(badKind.status, 400);
  assert.equal(badKind.json.error.code, 'VALIDATION');

  const req = await api('POST', `/api/spaces/${spaceId}/requests`, { createdBy: FOUNDER, title: 'Buy compute', instructions: 'Settle against proof.' });
  assert.equal(req.status, 201);
  assert.equal(req.json.request.status, 'Open');
  ctx.requestId = req.json.request.requestId;

  const accepted = await api('POST', `/api/spaces/${spaceId}/requests/${ctx.requestId}/accept`, { actorId: AGENT });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.request.status, 'Assigned');

  const double = await api('POST', `/api/spaces/${spaceId}/requests/${ctx.requestId}/accept`, { actorId: AGENT });
  assert.equal(double.status, 409);
  assert.equal(double.json.error.code, 'STATE_CONFLICT');

  const received = await api('GET', `/api/spaces/${spaceId}/requests/${ctx.requestId}/receive?actorId=${encodeURIComponent(AGENT)}`);
  assert.equal(received.status, 200);
  assert.ok(received.json.authority);
  assert.ok(received.json.space);

  const trace = await api('GET', `/api/spaces/${spaceId}/requests/${ctx.requestId}/trace`);
  assert.equal(trace.status, 200);
  assert.equal(trace.json.requestId, ctx.requestId);
});

test('M3-3: work lifecycle over HTTP (escrow → submit → approve → settle)', async () => {
  const { spaceId, requestId } = ctx;
  const created = await api('POST', `/api/spaces/${spaceId}/work`, {
    actorId: OP,
    provider: VENDOR,
    evaluator: OP,
    description: 'Conformance GPUs',
    budget: '350.00',
    deadline: new Date(Date.now() + 86400000).toISOString(),
    requestId,
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.status, 'Funded');
  ctx.jobId = created.json.job.jobId;

  const bounds = await api('GET', `/api/spaces/${spaceId}/bounds`);
  assert.equal(bounds.json.escrowed, '350.000000');

  const before = await adapter.balanceOf(VENDOR);
  const submitted = await api('POST', `/api/spaces/${spaceId}/work/${ctx.jobId}/submit`, {
    actorId: VENDOR,
    deliverableHash: `0x${'a'.repeat(64)}`,
    evidenceUri: 'ipfs://QmConform',
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.json.status, 'Submitted');

  const evaluated = await api('POST', `/api/spaces/${spaceId}/work/${ctx.jobId}/evaluate`, {
    evaluatorId: OP,
    approved: true,
    feedback: 'Verified via REST.',
  });
  assert.equal(evaluated.status, 200);
  assert.equal(evaluated.json.status, 'Completed');
  assert.equal(evaluated.json.receipt.status, 'SETTLED');
  assert.ok(/^0x[0-9a-fA-F]{64}$/.test(evaluated.json.receipt.txHash), 'real onchain tx hash');
  assert.ok(!('simulated' in evaluated.json.receipt), 'no simulated field exists anymore');
  const after = await adapter.balanceOf(VENDOR);
  assert.equal(after - before, 350_000_000n, 'provider gained exactly 350 USDC onchain');
});

test('M3-4: policy denial over HTTP is 422 with denialProof (Sandbox contract)', async () => {
  const { spaceId } = ctx;
  const denied = await api('POST', `/api/spaces/${spaceId}/payments`, {
    actorId: OP,
    recipient: VENDOR,
    amount: '900.00',
    memo: 'Over-cap attempt',
  });
  assert.equal(denied.status, 422);
  assert.equal(denied.json.error.code, 'POLICY_DENIAL');
  assert.ok(denied.json.error.details.denialProof);
  assert.ok(denied.json.error.details.denialProof.proofHash.startsWith('0x'));

  const bounds = await api('GET', `/api/spaces/${spaceId}/bounds`);
  assert.equal(bounds.json.denials, 1);
});

test('M3-5: activity pagination with seq cursors', async () => {
  const { spaceId } = ctx;
  const page1 = await api('GET', `/api/spaces/${spaceId}/activity?limit=3&cursor=0`);
  assert.equal(page1.status, 200);
  assert.equal(page1.json.activity.length, 3);
  assert.equal(page1.json.activity[0].seq, 0);
  assert.equal(page1.json.nextCursor, 3);

  const page2 = await api('GET', `/api/spaces/${spaceId}/activity?limit=200&cursor=${page1.json.nextCursor}`);
  assert.ok(page2.json.activity.every((a, i) => a.seq === page1.json.nextCursor + i));
  const types = page2.json.activity.map((a) => a.type);
  assert.ok(types.includes('WORK_COMPLETED'));
  assert.ok(types.includes('PAYMENT_DENIED'));
});

test('M3-6: SSE stream delivers live payment settlement', async () => {
  const { spaceId } = ctx;
  const res = await fetch(`${base}/api/spaces/${spaceId}/events`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const firstData = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw new Error('SSE closed before event');
      buffer += decoder.decode(value, { stream: true });
      const idx = buffer.indexOf('\ndata: ');
      if (idx !== -1) {
        const end = buffer.indexOf('\n\n', idx);
        if (end !== -1) {
          return JSON.parse(buffer.slice(idx + 7, end));
        }
      }
    }
  })();
  const payment = await api('POST', `/api/spaces/${spaceId}/payments`, {
    actorId: OP,
    recipient: VENDOR,
    amount: '50.00',
    memo: 'SSE probe',
  });
  assert.equal(payment.status, 200);
  assert.ok(/^0x[0-9a-fA-F]{64}$/.test(payment.json.receipt.txHash));

  const envelope = await Promise.race([
    firstData,
    new Promise((_, reject) => setTimeout(() => reject(new Error('SSE timeout')), 8000)),
  ]).finally(() => reader.cancel().catch(() => {}));
  assert.equal(envelope.type, 'PAYMENT_SETTLED');
  assert.equal(envelope.spaceId, spaceId);
  assert.ok(Number.isInteger(envelope.seq));
  // PAYMENT_SETTLED activity records spread the receipt flat.
  assert.equal(envelope.payload.receiptId, payment.json.receipt.receiptId);
  assert.equal(envelope.payload.amount, '50.00');
});

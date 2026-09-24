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

const VENDOR = '0x1111111111111111111111111111111111111111';
const FOUNDER = 'Ada Founder';
const AGENT = 'ConformanceBot';

let base;
let ctx;

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
  ctx = await start({ port: 0, store: new SpaceStore() });
  base = ctx.url;
});

test.after(async () => {
  ctx.server.closeAllConnections?.();
  ctx.server.close();
});

test('M3-1: health + space lifecycle (create → fund → bounds)', async () => {
  const health = await api('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);

  const created = await api('POST', '/api/spaces', { name: 'Conformance Space', actorId: FOUNDER });
  assert.equal(created.status, 201);
  const spaceId = created.json.space.id;
  assert.ok(spaceId.startsWith('space-'));
  ctx.spaceId = spaceId;

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
  const agent = await api('POST', `/api/spaces/${spaceId}/participants`, { kind: 'Agent', displayName: AGENT, address: '0x2222222222222222222222222222222222222222' });
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
    actorId: AGENT,
    provider: VENDOR,
    evaluator: FOUNDER,
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

  const submitted = await api('POST', `/api/spaces/${spaceId}/work/${ctx.jobId}/submit`, {
    actorId: VENDOR,
    deliverableHash: `0x${'a'.repeat(64)}`,
    evidenceUri: 'ipfs://QmConform',
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.json.status, 'Submitted');

  const evaluated = await api('POST', `/api/spaces/${spaceId}/work/${ctx.jobId}/evaluate`, {
    evaluatorId: FOUNDER,
    approved: true,
    feedback: 'Verified via REST.',
  });
  assert.equal(evaluated.status, 200);
  assert.equal(evaluated.json.status, 'Completed');
  assert.equal(evaluated.json.receipt.status, 'SETTLED');
  assert.ok(evaluated.json.receipt.txHash.startsWith('0x'));
  assert.equal(typeof evaluated.json.receipt.simulated, 'boolean');
});

test('M3-4: policy denial over HTTP is 422 with denialProof (Sandbox contract)', async () => {
  const { spaceId } = ctx;
  const denied = await api('POST', `/api/spaces/${spaceId}/payments`, {
    actorId: AGENT,
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
    actorId: AGENT,
    recipient: VENDOR,
    amount: '50.00',
    memo: 'SSE probe',
  });
  assert.equal(payment.status, 200);

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

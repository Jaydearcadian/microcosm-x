/**
 * M4 persistence tests: snapshot round-trip + full process kill and restart.
 * Evidence: no acknowledged state is dropped when the process dies.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { save, load } from '../src/persist.js';
import { buildDemoSpace } from '../src/seed.js';

function tmpFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-')), name);
}

async function api(base, method, p, body) {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

test('M4-1: snapshot round-trip preserves spaces, jobs, requests, counters', async () => {
  const store = new SpaceStore();
  const summary = await buildDemoSpace(store);
  const file = tmpFile('snapshot.json');

  save(store, file);
  const stat = fs.statSync(file);
  assert.ok(stat.size > 1024, 'snapshot should hold real state');
  assert.ok(stat.size < 1024 * 1024, 'snapshot should stay kilobytes');

  const revived = new SpaceStore();
  assert.equal(load(revived, file), true);
  assert.equal(revived.spaces.size, store.spaces.size);
  assert.equal(revived.getSpace(summary.spaceId).balance, store.getSpace(summary.spaceId).balance);
  assert.deepEqual(revived.getJob({ spaceId: summary.spaceId, jobId: summary.jobId }), store.getJob({ spaceId: summary.spaceId, jobId: summary.jobId }));
  assert.deepEqual(revived.getRequest({ spaceId: summary.spaceId, requestId: summary.requestId }), store.getRequest({ spaceId: summary.spaceId, requestId: summary.requestId }));
  assert.equal(revived.getActivity(summary.spaceId).length, store.getActivity(summary.spaceId).length);
  assert.equal(revived._nextJobSeq, store._nextJobSeq);
  assert.equal(revived._nextRequestSeq, store._nextRequestSeq);

  // Counters continue, never reuse IDs.
  const again = await buildDemoSpace(revived);
  assert.notEqual(again.jobId, summary.jobId);
  assert.notEqual(again.requestId, summary.requestId);

  assert.equal(load(new SpaceStore(), tmpFile('missing.json')), false);
});

test('M4-2: state survives SIGKILL and reboot (kill → restart → intact)', async (t) => {
  const file = tmpFile('live.json');
  const serverDir = new URL('..', import.meta.url).pathname;

  async function boot() {
    const child = spawn('node', ['src/server.js', '--port', '0', `--data=${file}`], { cwd: serverDir, stdio: ['ignore', 'pipe', 'pipe'] });
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server boot timeout')), 15000);
      let out = '';
      child.stdout.on('data', (c) => {
        out += c.toString();
        const m = out.match(/localhost:(\d+)/);
        if (m) {
          clearTimeout(timer);
          resolve(`http://localhost:${m[1]}`);
        }
      });
      child.on('error', reject);
    });
    // Wait until it answers.
    const deadline = Date.now() + 15000;
    for (;;) {
      try {
        const r = await fetch(`${url}/api/health`);
        if (r.ok) break;
      } catch { /* not up yet */ }
      if (Date.now() > deadline) throw new Error('server never became healthy');
      await new Promise((r) => setTimeout(r, 200));
    }
    return { child, url };
  }

  // Boot 1: create + fund, then murder the process mid-life.
  const first = await boot();
  const created = await api(first.url, 'POST', '/api/spaces', { name: 'Kill Test', actorId: 'Ada' });
  assert.equal(created.status, 201);
  const spaceId = created.json.space.id;
  const funded = await api(first.url, 'POST', `/api/spaces/${spaceId}/fund`, { amount: '1000.00', actorId: 'Ada' });
  assert.equal(funded.status, 200);
  assert.equal(funded.json.space.balance, '1000.000000');
  first.child.kill('SIGKILL');
  await new Promise((resolve) => first.child.on('exit', resolve));
  t.after(() => {
    try { first.child.kill('SIGKILL'); } catch { /* already dead */ }
  });

  // Snapshot must exist on disk despite the violent death.
  assert.ok(fs.existsSync(file));

  // Boot 2: same file → same world.
  const second = await boot();
  t.after(() => {
    try { second.child.kill('SIGKILL'); } catch { /* dead */ }
  });
  const refetched = await api(second.url, 'GET', `/api/spaces/${spaceId}`);
  assert.equal(refetched.status, 200);
  assert.equal(refetched.json.space.balance, '1000.000000');
  const activity = await api(second.url, 'GET', `/api/spaces/${spaceId}/activity?limit=100`);
  assert.ok(activity.json.activity.some((a) => a.type === 'SPACE_FUNDED'));
  second.child.kill('SIGKILL');
  await new Promise((resolve) => second.child.on('exit', resolve));
});

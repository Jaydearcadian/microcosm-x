/**
 * HTTP REST + SSE server over the SpaceStore model (M3 — Slice 9).
 *
 * Thin adapter only: every route delegates to SpaceStore methods, so REST
 * and MCP produce identical business state by construction. No auth —
 * same trust model as the MCP stdio server (local dev operator).
 */

import http from 'node:http';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { toBaseUnits, fromBaseUnits } from '../../policy-engine/src/index.js';
import { buildDemoSpace } from './seed.js';
import { save as saveSnapshot, load as loadSnapshot } from './persist.js';

const TERMINAL_JOB = new Set(['Completed', 'Rejected', 'Expired']);
const OPEN_JOB = new Set(['Funded', 'Submitted', 'Adjudicating']);

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function apiError(status, code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return { error };
}

function notFound(what) {
  return { status: 404, body: apiError(404, 'NOT_FOUND', what) };
}

/** Map store throws onto the frozen error vocabulary. */
function storeError(err) {
  const message = err && err.message ? err.message : 'Unknown error';
  if (/not found in Space|not found/i.test(message)) {
    return { status: 404, body: apiError(404, 'NOT_FOUND', message) };
  }
  // State machine conflicts first: "only Open …", "already …", halts.
  if (/only |already|terminal|halted|cannot |Adjudicating|verdict|nothing to judge/i.test(message)) {
    return { status: 409, body: apiError(409, 'STATE_CONFLICT', message) };
  }
  if (/must be|required|Invalid|non-empty|greater than|future|between|uint256|bytes32|not an active participant|not an admin|Duplicate/i.test(message)) {
    return { status: 400, body: apiError(400, 'VALIDATION', message) };
  }
  return { status: 409, body: apiError(409, 'STATE_CONFLICT', message) };
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length > 0) {
    throw Object.assign(new Error(`Missing required fields: ${missing.join(', ')}`), { httpStatus: 400, httpCode: 'VALIDATION' });
  }
}

function throwMapped(err) {
  if (err && err.httpStatus) {
    throw err;
  }
  const mapped = storeError(err);
  throw Object.assign(new Error(mapped.body.error.message), { httpStatus: mapped.status, httpCode: mapped.body.error.code });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 1024 * 1024) {
        reject(Object.assign(new Error('Request body too large'), { httpStatus: 400, httpCode: 'VALIDATION' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('Malformed JSON body'), { httpStatus: 400, httpCode: 'VALIDATION' }));
      }
    });
    req.on('error', reject);
  });
}

function withSeq(entries) {
  return entries.map((entry, index) => ({ seq: index, ...entry }));
}

export function spaceBounds(store, spaceId) {
  const space = store.getSpace(spaceId);
  if (!space) return null;
  let escrowed = 0n;
  for (const job of store.jobs.values()) {
    if (job.spaceId !== spaceId || !OPEN_JOB.has(job.status) || job.refunded) continue;
    try {
      escrowed += toBaseUnits(job.escrowedAmount || job.budget || '0');
    } catch {
      // ignore malformed amounts in legacy records
    }
  }
  const activity = store.getActivity(spaceId);
  const denials = activity.filter((a) => a.type === 'PAYMENT_DENIED' || a.type === 'WORK_DENIED').length;
  const dailyBudget = toBaseUnits(space.rules?.dailyBudget || '0');
  const spent = toBaseUnits(space.totalSpentToday || '0');
  const remaining = dailyBudget - spent - escrowed > 0n ? dailyBudget - spent - escrowed : 0n;
  return {
    spaceId: space.id,
    treasuryBalance: space.balance,
    spentToday: space.totalSpentToday,
    escrowed: fromBaseUnits(escrowed),
    remaining: fromBaseUnits(remaining),
    dailyBudget: space.rules?.dailyBudget || null,
    maxPerTransaction: space.rules?.maxPerTransaction || null,
    denials,
  };
}

export function createApp({ store = new SpaceStore(), dataPath = null, corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000' } = {}) {
  /** spaceId -> Set<http.ServerResponse> */
  const subscribers = new Map();

  function checkpoint() {
    if (dataPath) saveSnapshot(store, dataPath);
  }

  function publish(spaceId, entries, baseSeq) {
    const subs = subscribers.get(spaceId);
    if (!subs || subs.size === 0) return;
    for (const [index, entry] of entries.entries()) {
      const envelope = { seq: baseSeq + index, type: entry.type, at: entry.timestamp || new Date().toISOString(), spaceId, payload: entry };
      const frame = `event: ${entry.type}\ndata: ${JSON.stringify(envelope)}\n\n`;
      for (const res of subs) {
        try {
          res.write(frame);
        } catch {
          // dead subscriber; reaped on 'close'
        }
      }
    }
  }

  /** Run a space mutation, fan out SSE, then checkpoint to disk (M4). */
  async function mutate(spaceId, fn) {
    const before = store.getActivity(spaceId).length;
    const result = await fn();
    const after = store.getActivity(spaceId);
    if (after.length > before) {
      publish(spaceId, after.slice(before), before);
    }
    checkpoint();
    return result;
  }

  function corsHeaders() {
    return {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Last-Event-ID',
    };
  }

  return { store, subscribers, publish, mutate, checkpoint, corsHeaders, spaceBounds: (id) => spaceBounds(store, id) };
}

export async function start({ port = 8787, seed = false, dataPath = process.env.DATA_PATH || null, store = new SpaceStore() } = {}) {
  let restored = false;
  if (dataPath) {
    restored = loadSnapshot(store, dataPath);
  }
  if (restored) {
    console.log(`[persist] restored ${store.spaces.size} space(s) from ${dataPath}`);
  } else if (seed) {
    const summary = await buildDemoSpace(store);
    console.log(`[seed] space ${summary.spaceId} (${summary.spaceName})`);
    console.log(`[seed] treasury ${summary.treasury} USDC · request ${summary.requestId} (${summary.requestStatus}) · job ${summary.jobId} (${summary.jobStatus})`);
    if (dataPath) {
      saveSnapshot(store, dataPath);
      console.log(`[persist] snapshot written to ${dataPath}`);
    }
  }
  const app = createApp({ store, dataPath });
  const mode = restored ? 'restored' : (seed ? 'seeded' : 'fresh');
  const server = http.createServer((req, res) => dispatch(app, req, res));
  return new Promise((resolve) => {
    server.listen(port, () => {
      const actual = server.address().port;
      console.log(`[server] Microcosm REST+SSE on http://localhost:${actual} (store: ${mode})`);
      resolve({ server, app, store, port: actual, url: `http://localhost:${actual}` });
    });
  });
}

async function dispatch(app, req, res) {
  const { store } = app;
  const headers = app.corsHeaders();
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  const query = Object.fromEntries(url.searchParams.entries());

  const fail = (status, code, message, details) => {
    sendJson(res, status, apiError(status, code, message, details), headers);
  };

  try {
    const path = url.pathname;

    // --- SSE stream (hijacks the socket; no JSON envelope) ---
    let m = path.match(/^\/api\/spaces\/([^/]+)\/events$/);
    if (req.method === 'GET' && m) {
      const spaceId = decodeURIComponent(m[1]);
      if (!store.getSpace(spaceId)) {
        fail(404, 'NOT_FOUND', `Space '${spaceId}' not found`);
        return;
      }
      res.writeHead(200, {
        ...headers,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 5000\n\n');
      if (!app.subscribers.has(spaceId)) app.subscribers.set(spaceId, new Set());
      app.subscribers.get(spaceId).add(res);
      // Replay missed records for ?since= cursor resume.
      const since = query.since !== undefined ? Number(query.since) : NaN;
      if (Number.isFinite(since) && since >= 0) {
        const missed = store.getActivity(spaceId).slice(since);
        missed.forEach((entry, i) => {
          const envelope = { seq: since + i, type: entry.type, at: entry.timestamp || new Date().toISOString(), spaceId, payload: entry };
          res.write(`event: ${entry.type}\ndata: ${JSON.stringify(envelope)}\n\n`);
        });
      }
      const heartbeat = setInterval(() => {
        try {
          res.write(':heartbeat\n\n');
        } catch {
          clearInterval(heartbeat);
        }
      }, 20000);
      req.on('close', () => {
        clearInterval(heartbeat);
        app.subscribers.get(spaceId)?.delete(res);
      });
      return;
    }

    const body = req.method === 'POST' ? await readBody(req) : {};
    const ok = (status, responseBody) => sendJson(res, status, responseBody, headers);

    const needSpace = (spaceId) => {
      const space = store.getSpace(spaceId);
      if (!space) throw Object.assign(new Error(`Space '${spaceId}' not found`), { httpStatus: 404, httpCode: 'NOT_FOUND' });
      return space;
    };

    // --- health ---
    if (req.method === 'GET' && path === '/api/health') {
      const spaces = store.listSpaces();
      const first = spaces.length > 0 ? store.getSpace(spaces[0].id) : null;
      return ok(200, { ok: true, network: 'OKX X Layer Testnet', chainId: first?.chainId || 1952, time: new Date().toISOString() });
    }

    // --- spaces ---
    if (req.method === 'GET' && path === '/api/spaces') {
      return ok(200, { spaces: store.listSpaces(query.actorId || undefined) });
    }
    if (req.method === 'POST' && path === '/api/spaces') {
      requireFields(body, ['name']);
      if (body.chainId !== undefined && !Number.isInteger(Number(body.chainId))) {
        throw Object.assign(new Error("'chainId' must be an integer"), { httpStatus: 400, httpCode: 'VALIDATION' });
      }
      // chainId/network are settable because settlement is chain-bound:
      // a Space must live on the chain it settles on (loud mismatch otherwise).
      const space = store.createSpace({ name: body.name, description: body.description || '', actorId: body.actorId || 'founder-01', chainId: body.chainId !== undefined ? Number(body.chainId) : undefined, network: body.network });
      const created = store.getActivity(space.id);
      app.publish(space.id, created, 0);
      app.checkpoint();
      return ok(201, { space });
    }
    m = path.match(/^\/api\/spaces\/([^/]+)$/);
    if (req.method === 'GET' && m) {
      const space = needSpace(decodeURIComponent(m[1]));
      return ok(200, { space });
    }
    m = path.match(/^\/api\/spaces\/([^/]+)\/bounds$/);
    if (req.method === 'GET' && m) {
      const spaceId = decodeURIComponent(m[1]);
      needSpace(spaceId);
      return ok(200, app.spaceBounds(spaceId));
    }
    m = path.match(/^\/api\/spaces\/([^/]+)\/capabilities$/);
    if (req.method === 'GET' && m) {
      requireFields({ ...query, ...body }, ['actorId']);
      const spaceId = decodeURIComponent(m[1]);
      needSpace(spaceId);
      try {
        return ok(200, store.getCapabilities(spaceId, query.actorId || body.actorId));
      } catch (err) {
        throwMapped(err);
      }
    }
    m = path.match(/^\/api\/spaces\/([^/]+)\/fund$/);
    if (req.method === 'POST' && m) {
      requireFields(body, ['amount', 'actorId']);
      const spaceId = decodeURIComponent(m[1]);
      needSpace(spaceId);
      try {
        const space = await app.mutate(spaceId, async () => store.fundSpace({ spaceId, amount: body.amount, actorId: body.actorId }));
        return ok(200, { space });
      } catch (err) {
        throwMapped(err);
      }
    }

    // --- participants ---
    m = path.match(/^\/api\/spaces\/([^/]+)\/participants$/);
    if (m) {
      const spaceId = decodeURIComponent(m[1]);
      needSpace(spaceId);
      if (req.method === 'GET') {
        return ok(200, { participants: store.listParticipants({ spaceId, kind: query.kind || null, status: query.status || null }) });
      }
      if (req.method === 'POST') {
        requireFields(body, ['kind', 'displayName']);
        try {
          const participant = await app.mutate(spaceId, async () => store.addParticipant({ spaceId, kind: body.kind, displayName: body.displayName, address: body.address || null, externalRef: body.externalRef || null, actorId: body.actorId || null }));
          return ok(201, { participant });
        } catch (err) {
          throwMapped(err);
        }
      }
    }
    m = path.match(/^\/api\/spaces\/([^/]+)\/participants\/([^/]+)\/deactivate$/);
    if (req.method === 'POST' && m) {
      const spaceId = decodeURIComponent(m[1]);
      needSpace(spaceId);
      try {
        const participant = await app.mutate(spaceId, async () => store.deactivateParticipant({ spaceId, participantId: decodeURIComponent(m[2]), actorId: body.actorId || null }));
        return ok(200, { participant });
      } catch (err) {
        throwMapped(err);
      }
    }

    // --- requests ---
    m = path.match(/^\/api\/spaces\/([^/]+)\/requests$/);
    if (m) {
      const spaceId = decodeURIComponent(m[1]);
      needSpace(spaceId);
      if (req.method === 'GET') {
        return ok(200, { requests: store.listRequests({ spaceId, status: query.status || null, assignee: query.assignee || null, createdBy: query.createdBy || null }) });
      }
      if (req.method === 'POST') {
        requireFields(body, ['createdBy', 'title']);
        try {
          const request = await app.mutate(spaceId, async () => store.createRequest({ spaceId, createdBy: body.createdBy, assignee: body.assignee || null, title: body.title, instructions: body.instructions || '', context: body.context || null }));
          return ok(201, { request });
        } catch (err) {
          throwMapped(err);
        }
      }
    }
    const requestAction = async (spaceId, requestId, fn) => {
      needSpace(spaceId);
      try {
        return await app.mutate(spaceId, async () => fn());
      } catch (err) {
        throwMapped(err);
      }
    };
    m = path.match(/^\/api\/spaces\/([^/]+)\/requests\/([^/]+)$/);
    if (req.method === 'GET' && m && !/\/requests\/[^/]+\//.test(path)) {
      const spaceId = decodeURIComponent(m[1]);
      const requestId = decodeURIComponent(m[2]);
      needSpace(spaceId);
      try {
        return ok(200, { request: store.getRequest({ spaceId, requestId }) });
      } catch (err) {
        throwMapped(err);
      }
    }
    m = path.match(/^\/api\/spaces\/([^/]+)\/requests\/([^/]+)\/(accept|complete|block|cancel)$/);
    if (req.method === 'POST' && m) {
      const spaceId = decodeURIComponent(m[1]);
      const requestId = decodeURIComponent(m[2]);
      const action = m[3];
      if (action === 'accept') {
        requireFields(body, ['actorId']);
        const request = await requestAction(spaceId, requestId, () => store.acceptRequest({ spaceId, requestId, actorId: body.actorId }));
        return ok(200, { request });
      }
      if (action === 'complete') {
        requireFields(body, ['actorId']);
        const request = await requestAction(spaceId, requestId, () => store.completeRequest({ spaceId, requestId, actorId: body.actorId, result: body.result }));
        return ok(200, { request });
      }
      if (action === 'block' || action === 'cancel') {
        requireFields(body, ['actorId']);
        const fn = action === 'block' ? store.blockRequest.bind(store) : store.cancelRequest.bind(store);
        const request = await requestAction(spaceId, requestId, () => fn({ spaceId, requestId, actorId: body.actorId, reason: body.reason }));
        return ok(200, { request });
      }
    }
    m = path.match(/^\/api\/spaces\/([^/]+)\/requests\/([^/]+)\/receive$/);
    if (req.method === 'GET' && m) {
      const spaceId = decodeURIComponent(m[1]);
      const requestId = decodeURIComponent(m[2]);
      needSpace(spaceId);
      requireFields({ ...query }, ['actorId']);
      try {
        return ok(200, store.receiveRequest({ spaceId, requestId, actorId: query.actorId }));
      } catch (err) {
        throwMapped(err);
      }
    }
    m = path.match(/^\/api\/spaces\/([^/]+)\/requests\/([^/]+)\/trace$/);
    if (req.method === 'GET' && m) {
      const spaceId = decodeURIComponent(m[1]);
      const requestId = decodeURIComponent(m[2]);
      needSpace(spaceId);
      try {
        return ok(200, store.traceRequest({ spaceId, requestId }));
      } catch (err) {
        throwMapped(err);
      }
    }

    // --- work ---
   const workAction = async (spaceId, fn) => {
      needSpace(spaceId);
      try {
        return await app.mutate(spaceId, async () => fn());
      } catch (err) {
        throwMapped(err);
      }
    };
    const denied = (result) => ({
      status: 422,
      body: apiError(422, 'POLICY_DENIAL', 'Policy boundary violation', { denialProof: result.denialProof, reasons: result.reasons }),
    });
    m = path.match(/^\/api\/spaces\/([^/]+)\/work$/);
    if (m) {
      const spaceId = decodeURIComponent(m[1]);
      needSpace(spaceId);
      if (req.method === 'GET') {
        const jobs = [...store.jobs.values()].filter((j) => j.spaceId === spaceId).map((j) => ({ ...j }));
        return ok(200, { jobs });
      }
      if (req.method === 'POST') {
        requireFields(body, ['actorId', 'provider', 'evaluator', 'description', 'budget', 'deadline']);
        const result = await workAction(spaceId, () => store.createJob({ spaceId, actorId: body.actorId, provider: body.provider, evaluator: body.evaluator, adjudicator: body.adjudicator, rubricHash: body.rubricHash, description: body.description, budget: body.budget, deadline: body.deadline, requestId: body.requestId }));
        if (result.status === 'REJECTED') {
          const d = denied(result);
          return sendJson(res, d.status, d.body, headers);
        }
        return ok(201, result);
      }
    }
    m = path.match(/^\/api\/spaces\/([^/]+)\/work\/([^/]+)$/);
    if (req.method === 'GET' && m) {
      const spaceId = decodeURIComponent(m[1]);
      const jobId = decodeURIComponent(m[2]);
      needSpace(spaceId);
      try {
        const job = await app.mutate(spaceId, async () => store.getJob({ spaceId, jobId }));
        return ok(200, { job });
      } catch (err) {
        throwMapped(err);
      }
    }
    m = path.match(/^\/api\/spaces\/([^/]+)\/work\/([^/]+)\/(submit|evaluate|request-verdict|post-verdict)$/);
    if (req.method === 'POST' && m) {
      const spaceId = decodeURIComponent(m[1]);
      const jobId = decodeURIComponent(m[2]);
      const action = m[3];
      if (action === 'submit') {
        requireFields(body, ['actorId', 'deliverableHash']);
        const result = await workAction(spaceId, () => store.submitDeliverable({ spaceId, jobId, actorId: body.actorId, deliverableHash: body.deliverableHash, evidenceUri: body.evidenceUri }));
        return ok(200, result);
      }
      if (action === 'evaluate') {
        requireFields(body, ['evaluatorId', 'approved']);
        const result = await workAction(spaceId, () => store.evaluateJob({ spaceId, jobId, evaluatorId: body.evaluatorId, approved: body.approved, feedback: body.feedback }));
        return ok(200, result);
      }
      if (action === 'request-verdict') {
        requireFields(body, ['actorId']);
        const result = await workAction(spaceId, () => store.requestVerdict({ spaceId, jobId, actorId: body.actorId }));
        return ok(200, result);
      }
      if (action === 'post-verdict') {
        requireFields(body, ['adjudicatorId', 'approved']);
        const result = await workAction(spaceId, () => store.postVerdict({ spaceId, jobId, adjudicatorId: body.adjudicatorId, approved: body.approved, reason: body.reason }));
        return ok(200, result);
      }
    }

    // --- payments ---
    m = path.match(/^\/api\/spaces\/([^/]+)\/payments$/);
    if (req.method === 'POST' && m) {
      const spaceId = decodeURIComponent(m[1]);
      needSpace(spaceId);
      requireFields(body, ['actorId', 'recipient', 'amount']);
      const result = await workAction(spaceId, () => store.requestPayment({ spaceId, actorId: body.actorId, recipient: body.recipient, amount: body.amount, memo: body.memo }));
      if (result.status === 'REJECTED') {
        const d = denied(result);
        return sendJson(res, d.status, d.body, headers);
      }
      return ok(200, result);
    }

    // --- activity (paginated, seq-decorated) ---
    m = path.match(/^\/api\/spaces\/([^/]+)\/activity$/);
    if (req.method === 'GET' && m) {
      const spaceId = decodeURIComponent(m[1]);
      needSpace(spaceId);
      const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
      const cursor = query.cursor !== undefined ? Number(query.cursor) : 0;
      if (!Number.isInteger(cursor) || cursor < 0) {
        return fail(400, 'VALIDATION', "'cursor' must be a non-negative integer");
      }
      const all = withSeq(store.getActivity(spaceId));
      const items = all.slice(cursor, cursor + limit);
      return ok(200, { activity: items, nextCursor: cursor + items.length });
    }

    return fail(404, 'NOT_FOUND', `No route ${req.method} ${path}`);
  } catch (err) {
    if (err && err.httpStatus) {
      return fail(err.httpStatus, err.httpCode || 'STATE_CONFLICT', err.message);
    }
    const mapped = storeError(err);
    return fail(mapped.status, mapped.body.error.code, mapped.body.error.message);
  }
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const argv = process.argv.slice(2);
  const flagValue = (name) => {
    const eq = argv.find((a) => a.startsWith(`${name}=`));
    if (eq) return eq.slice(name.length + 1);
    const i = argv.indexOf(name);
    if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
    return null;
  };
  const port = Number(flagValue('--port') || process.env.PORT || 8787);
  const dataPath = flagValue('--data') || process.env.DATA_PATH || null;
  const seed = argv.includes('--seed');
  start({ port, seed, dataPath });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { SpaceStore } from '../../../mcp/src/space-store.js';
import { chunkGetLogs, startIndexer } from '../src/indexer-runtime.js';
import { start } from '../src/server.js';

const KERNEL = '0xcdddcdc435f9c6c4a38d1e421b89fdcd7be92a81';

test('M9-10: chunkGetLogs never requests a range wider than the RPC limit', async () => {
  const seen = [];
  const base = {
    getLogs: async (params) => {
      seen.push({ from: Number(params.fromBlock), to: Number(params.toBlock) });
      return [];
    },
  };
  const chunked = chunkGetLogs(base, 100);
  await chunked.getLogs({ fromBlock: 0n, toBlock: 250n });
  assert.equal(seen.length, 3);
  assert.deepEqual(seen, [{ from: 0, to: 99 }, { from: 100, to: 199 }, { from: 200, to: 250 }]);
  for (const window of seen) assert.ok(window.to - window.from < 100, 'window stays inside the limit');
});

test('M9-10: a range already inside the limit is passed through untouched', async () => {
  const seen = [];
  const base = { getLogs: async (params) => { seen.push(params); return ['kept']; } };
  const result = await chunkGetLogs(base, 100).getLogs({ fromBlock: 5n, toBlock: 20n });
  assert.equal(seen.length, 1);
  assert.deepEqual(result, ['kept']);
});

test('M9-10: chunkGetLogs tolerates a missing toBlock and hex inputs', async () => {
  const seen = [];
  const base = { getLogs: async (params) => { seen.push(Number(params.fromBlock)); return []; } };
  await chunkGetLogs(base, 100).getLogs({ fromBlock: '0x0' });
  assert.deepEqual(seen, [0]);
});

test('M9-10: startIndexer reports reconciliation and projection state for an empty chain', async () => {
  const store = new SpaceStore();
  const handle = await startIndexer({
    store,
    chainId: 1952,
    contractAddress: KERNEL,
    spaceId: 'space-procurement-001',
    fromBlock: 0,
    client: { getBlockNumber: async () => 0n, getLogs: async () => [] },
  });
  try {
    // initialState is captured after the first sync settles, so it is stable
    // even though the run loop has already begun its next cycle
    const state = handle.initialState();
    assert.equal(state.enabled, true);
    assert.equal(state.chainId, 1952);
    assert.equal(state.transport, 'injected');
    assert.equal(state.reconciliation.status, 'RECONCILED');
    assert.equal(state.projectionCount, 0);
    assert.equal(state.contractAddress, KERNEL);
    assert.equal(handle.state().enabled, true);
  } finally {
    await handle.stop();
  }
});

test('M9-10: the tail loop never runs concurrently with the catch-up', async () => {
  const store = new SpaceStore();
  const concurrent = { maxInFlight: 0, inFlight: 0 };
  // 40 blocks of history with a 10-block window forces several catch-up passes
  const client = {
    getBlockNumber: async () => {
      concurrent.inFlight += 1;
      concurrent.maxInFlight = Math.max(concurrent.maxInFlight, concurrent.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      concurrent.inFlight -= 1;
      return 40n;
    },
    getLogs: async () => [],
  };
  const commits = [];
  const handle = await startIndexer({
    store,
    chainId: 1952,
    contractAddress: KERNEL,
    fromBlock: 0,
    client,
    catchUpWindow: 10,
    intervalMs: 1,
    awaitFirstSync: true,
    persist: async () => { commits.push(1); },
  });
  try {
    const state = handle.initialState();
    assert.ok(state.catchUp.windowsDone >= 4, `expected several committed windows, got ${state.catchUp.windowsDone}`);
    assert.equal(concurrent.maxInFlight, 1, 'only one sync may touch the store at a time');
    assert.ok(commits.length >= 4, 'each window commits its progress');
    assert.equal(state.catchUp.complete, true);
    assert.equal(state.reconciliation.status, 'RECONCILED');
  } finally {
    await handle.stop();
  }
});

test('M9-10: the indexer route reports honestly when no chain is configured', async () => {
  const ctx = await start({ port: 0, store: new SpaceStore() });
  try {
    const list = await (await fetch(`${ctx.url}/api/spaces`)).json();
    const spaceId = list.spaces[0].id;
    const body = await (await fetch(`${ctx.url}/api/spaces/${spaceId}/indexer`)).json();
    assert.equal(body.indexer.enabled, false);
    assert.match(body.indexer.reason, /no chain indexer is configured/);
  } finally {
    ctx.server.closeAllConnections?.();
    ctx.server.close();
  }
});

test('M9-10: the indexer route reports a wired chain', async () => {
  const ctx = await start({
    port: 0,
    store: new SpaceStore(),
    indexer: {
      chainId: 1952,
      contractAddress: KERNEL,
      spaceId: 'space-procurement-001',
      fromBlock: 0,
      client: { getBlockNumber: async () => 0n, getLogs: async () => [] },
    },
  });
  try {
    await ctx.stopIndexer();
    const list = await (await fetch(`${ctx.url}/api/spaces`)).json();
    const spaceId = list.spaces[0].id;
    const body = await (await fetch(`${ctx.url}/api/spaces/${spaceId}/indexer`)).json();
    assert.equal(body.indexer.enabled, true);
    assert.equal(body.indexer.chainId, 1952);
    assert.equal(body.indexer.reconciliation.status, 'RECONCILED');
    assert.equal(body.indexer.requestedSpaceId, spaceId);
  } finally {
    await ctx.stopIndexer();
    ctx.server.closeAllConnections?.();
    ctx.server.close();
  }
});

test('M9-12: the runtime rebuilds when the cursor lags its own projections', async () => {
  // The live X Layer wedge. The persisted state had a job projected Rejected
  // from block 41645865 while the cursor sat at 41645475, so every catch-up
  // window replayed JobFunded onto a terminal job and threw. startIndexer must
  // detect the inconsistency, drop the derived state, and replay the range
  // cleanly instead of stalling.
  const store = new SpaceStore();
  const makeLog = (blockNumber, logIndex, eventName, args) => ({ eventName, blockNumber, logIndex, args });
  const logs = [
    makeLog(10, 0, 'JobCreated', {
      jobId: 7n,
      client: '0x1111111111111111111111111111111111111111',
      evaluator: '0x2222222222222222222222222222222222222222',
      provider: '0x3333333333333333333333333333333333333333',
      description: 'rewind regression',
      expiredAt: 2_000_000_000n,
    }),
    makeLog(30, 0, 'JobFunded', { jobId: 7n, amount: 1_000_000_000_000_000_000n }),
    makeLog(40, 0, 'JobRejected', { jobId: 7n, rejector: '0x2222222222222222222222222222222222222222', reason: `0x${'e'.repeat(64)}` }),
  ];
  const client = {
    getBlockNumber: async () => 50n,
    getLogs: async ({ fromBlock, toBlock }) => logs.filter(
      (log) => Number(log.blockNumber) >= Number(fromBlock) && Number(log.blockNumber) <= Number(toBlock),
    ),
  };

  // first pass projects the job and checkpoints a cursor at 40
  const first = await startIndexer({
    store, chainId: 1952, contractAddress: KERNEL, spaceId: 'space-procurement-001', fromBlock: 0, client, awaitFirstSync: true,
  });
  const projected = first.state();
  const cursorKey = first.cursorKey;
  await first.stop();
  assert.equal(projected.projectionCount, 1);
  assert.equal(projected.projectedJobs[0].status, 'Rejected');

  // rewind the cursor the way a restored state file or a moved fromBlock does,
  // leaving the projection from block 40 in place
  store.indexerCursors.set(cursorKey, { blockNumber: 20, txHash: `0x${'a'.repeat(64)}`, logIndex: 0 });
  assert.ok(store.indexedProjectionRange({ spaceId: 'space-procurement-001', chainId: 1952, contractAddress: KERNEL }).maxBlock > 20);

  // the runtime must self-heal rather than throw on every window
  const errors = [];
  const second = await startIndexer({
    store, chainId: 1952, contractAddress: KERNEL, spaceId: 'space-procurement-001', fromBlock: 0, client,
    awaitFirstSync: true, onError: (reason) => errors.push(String(reason?.message ?? reason)),
  });
  const healed = second.initialState();
  await second.stop();

  assert.ok(
    errors.some((message) => /lagged projections/.test(message)),
    `expected a rebuild notice, got ${JSON.stringify(errors)}`,
  );
  assert.equal(healed.reconciliation.status, 'RECONCILED');
  assert.equal(healed.reconciliation.error, null);
  assert.equal(healed.projectionCount, 1);
  assert.equal(healed.projectedJobs[0].status, 'Rejected');
  assert.ok(healed.cursor.blockNumber >= 40, `cursor reached the end of history, got ${healed.cursor.blockNumber}`);
});

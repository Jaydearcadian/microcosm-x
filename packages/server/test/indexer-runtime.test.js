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

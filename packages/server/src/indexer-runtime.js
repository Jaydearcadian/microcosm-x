/**
 * Production indexer runtime.
 *
 * M9's indexer is a verified library with no production consumer: nothing
 * constructed it, so the store's indexer cursor, reconciliation, and reorg
 * maps stayed empty and the Audit view showed only server-side activity.
 *
 * This module wires it to a live chain. Public RPC endpoints reject log
 * ranges wider than 100 blocks, so the injected client chunks getLogs and
 * the indexer module itself stays untouched and fully test-covered.
 */
import { createPublicClient, http } from "viem";
import { JobCreatedIndexer, IndexerRunLoop } from "../../../mcp/src/indexer.js";

const DEFAULT_MAX_BLOCK_RANGE = 100;

function toBigInt(value, fallback = 0n) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  return BigInt(value);
}

/**
 * Wraps a viems client so a single getLogs never exceeds maxBlockRange.
 * Failures are surfaced as-is; the indexer records them in its
 * reconciliation state rather than silently skipping history.
 */
export function chunkGetLogs(client, maxBlockRange = DEFAULT_MAX_BLOCK_RANGE) {
  const span = BigInt(maxBlockRange);
  return {
    ...client,
    async getLogs(params) {
      const from = toBigInt(params.fromBlock, 0n);
      const to = toBigInt(params.toBlock, from);
      if (to < from || to - from < span) return client.getLogs(params);
      const logs = [];
      for (let start = from; start <= to; start += span) {
        const end = start + span - 1n > to ? to : start + span - 1n;
        const page = await client.getLogs({ ...params, fromBlock: start, toBlock: end });
        logs.push(...page);
      }
      return logs;
    },
  };
}

export function createIndexerClient({ chainId, rpcUrl, maxBlockRange = DEFAULT_MAX_BLOCK_RANGE }) {
  const base = createPublicClient({
    chain: {
      id: Number(chainId),
      name: `chain-${chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [String(rpcUrl)] } },
    },
    transport: http(String(rpcUrl)),
  });
  return chunkGetLogs(base, maxBlockRange);
}

/**
 * Starts the composite AgenticCommerce indexer plus its run loop against a
 * live chain. Returns a handle exposing the same cursor, reconciliation, and
 * projection state the tests assert on, so the UI can report it honestly.
 */
export async function startIndexer({
  store,
  chainId,
  contractAddress,
  rpcUrl,
  spaceId = "space-procurement-001",
  fromBlock = 0,
  reorgDepth = 8,
  intervalMs = 5000,
  dataPath = null,
  persist = null,
  client = null,
  maxBlockRange = DEFAULT_MAX_BLOCK_RANGE,
  onError = null,
  // A deployment must never block its HTTP listener on a long historical
  // backfill, so the server starts with this off and reports RECONCILING
  // while the catch-up runs in the background.
  awaitFirstSync = true,
  // Blocks per committed catch-up pass. 0 disables windowed catch-up and lets
  // the run loop do a single unbounded sync instead.
  catchUpWindow = 20000,
} = {}) {
  if (!rpcUrl && !client) throw new Error("startIndexer requires an rpcUrl or an injected client");
  const activeClient = client || createIndexerClient({ chainId, rpcUrl, maxBlockRange });
  const indexer = new JobCreatedIndexer({
    store,
    chainId,
    contractAddress,
    rpcUrl,
    client: activeClient,
    transportType: client ? "injected" : "http",
    spaceId,
    fromBlock: Number(fromBlock),
    reorgDepth: Number(reorgDepth),
    dataPath,
    persist,
  });

  // A SpaceStore projection cannot be mutated by two syncs at once. Running the
  // tail loop alongside the catch-up let the unbounded sync checkpoint a stale
  // cursor and walk it backwards, so the loop stays idle until the catch-up
  // releases it.
  let catchingUp = true;

  const loop = new IndexerRunLoop({
    sync: async () => {
      if (catchingUp) return;
      try {
        await indexer.sync();
      } catch (reason) {
        if (onError) onError(reason);
      }
    },
    intervalMs: Number(intervalMs),
  });

  // A single unbounded sync only checkpoints when the whole pass finishes, so a
  // 270k-block backfill never persisted progress and any interruption restarted
  // from the deploy block. Catch up in bounded, committed windows instead.
  const catchUp = {
    active: false,
    fromBlock: Number(fromBlock),
    targetBlock: null,
    windowBlocks: Number(catchUpWindow),
    windowsDone: 0,
    complete: false,
  };

  const projections = () => [...store.jobs.values()].filter((job) => job?.source === "onchain");

  function handleState() {
      const cursor = indexer.getCursor();
      const reconciliation = indexer.getReconciliationState();
      const jobs = projections();
      return {
        enabled: true,
        spaceId: indexer.spaceId,
        chainId: indexer.chainId,
        contractAddress: indexer.contractAddress,
        transport: indexer.transportType,
        cursorKey: indexer.cursorKey,
        fromBlock: indexer.fromBlock,
        cursor,
        reconciliation,
        reorgDepth: indexer.reorgDepth,
        catchUp: { ...catchUp },
        projectionCount: jobs.length,
        projectedJobs: jobs.map((job) => ({
          jobId: job.jobId,
          status: job.status,
          onchainJobId: job.onchainJobId ?? null,
          lastBlock: job.lastBlock ?? job.blockNumber ?? null,
        })),
      };
  }

  async function commit() {
    if (persist) await persist(store);
  }

  async function catchUpLoop() {
    if (catchUpWindow <= 0) { catchingUp = false; return; }
    catchUp.active = true;
    // A window containing no events writes no cursor, so window progress must be
    // tracked locally. Deriving the next window from the cursor alone replays
    // the same quiet range forever and never terminates.
    let scannedTo = indexer.getCursor()?.blockNumber ?? Number(fromBlock);
    try {
      for (;;) {
        const head = Number(await indexer.client.getBlockNumber());
        catchUp.targetBlock = head;
        if (scannedTo >= head) { catchUp.complete = true; break; }
        const to = Math.min(scannedTo + catchUp.windowBlocks, head);
        await indexer.sync({ fromBlock: scannedTo + 1, toBlock: to });
        await commit();
        const cursorBlock = indexer.getCursor()?.blockNumber;
        scannedTo = typeof cursorBlock === 'number' && cursorBlock > scannedTo ? cursorBlock : to;
        catchUp.windowsDone += 1;
      }
    } catch (reason) {
      if (onError) onError(reason);
    } finally {
      catchUp.active = false;
      catchingUp = false;
    }
  }

  let initialState = null;
  if (awaitFirstSync) {
    await catchUpLoop();
    await loop.sync();
    initialState = handleState();
  } else {
    catchUpLoop()
      .then(() => loop.sync())
      .catch(() => {})
      .then(() => { initialState = handleState(); });
  }
  loop.start();

  return {
    indexer,
    loop,
    cursorKey: indexer.cursorKey,
    stop: () => loop.stop(),
    // snapshot taken after the first sync completed; falls back to live state
    // while a background catch-up is still running
    initialState: () => structuredClone(initialState ?? handleState()),
    state: handleState,
  };
}

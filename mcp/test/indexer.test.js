import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicClient, http } from "viem";
import { SpaceStore } from "../src/space-store.js";
import { JobCreatedIndexer } from "../src/indexer.js";
import { ensureChain } from "./helpers/chain.mjs";
import { load, save } from "../../packages/server/src/persist.js";

let chain;
let publicClient;

function cast(...args) {
  return execFileSync("cast", args, { encoding: "utf8" }).trim();
}

function createJob(description) {
  const expiry = String(Math.floor(Date.now() / 1000) + 86_400);
  return cast("send", chain.contracts.AgenticCommerce, "createJob(address,address,uint256,string)", chain.addrs.provider, chain.addrs.deployer, expiry, description, "--private-key", chain.keys.deployer, "--rpc-url", chain.rpc);
}

test.before(async () => {
  chain = await ensureChain({ port: 18547 });
  publicClient = createPublicClient({
    chain: {
      id: chain.chainId,
      name: "anvil",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [chain.rpc] } },
    },
    transport: http(chain.rpc),
  });
});

test.after(async () => {
  if (chain) await chain.cleanup();
});

test("M9-2: JobCreated cursor resumes later logs in the same block", async () => {
  const first = {
    blockNumber: 10,
    transactionHash: `0x${"1".repeat(64)}`,
    logIndex: 0,
    args: [1n, "0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333", "first", 2_000_000_000],
  };
  const second = {
    blockNumber: 10,
    transactionHash: `0x${"2".repeat(64)}`,
    logIndex: 1,
    args: [2n, "0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333", "second", 2_000_000_000],
  };
  const store = new SpaceStore();
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [first, second] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: "0x4444444444444444444444444444444444444444", client });
  store.indexerCursors.set(indexer.cursorKey, { blockNumber: 10, txHash: first.transactionHash, logIndex: 0 });

  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  assert.equal(result.processed, 1);
  assert.equal(store.jobs.size, 1);
  assert.equal([...store.jobs.values()][0].onchainJobId, "2");
});

test("M9-1: JobCreated indexer ingests two logs and survives restart replay idempotently", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "microcosm-m9-"));
  const snapshotPath = path.join(directory, "store.json");
  const spaceId = "space-procurement-001";
  try {
    createJob("First indexed work");
    createJob("Second indexed work");
    const head = Number(await publicClient.getBlockNumber());
    const store = new SpaceStore();
    const indexer = new JobCreatedIndexer({
      store,
      chainId: chain.chainId,
      contractAddress: chain.contracts.AgenticCommerce,
      rpcUrl: chain.rpc,
      dataPath: snapshotPath,
    });

    const first = await indexer.sync({ toBlock: head });
    assert.equal(first.processed, 2);
    assert.equal(store.jobs.size, 2);
    assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_CREATED").length, 2);
    assert.ok(indexer.getCursor().blockNumber > 0);
    assert.match(indexer.getCursor().txHash, /^0x[0-9a-f]{64}$/);
    assert.equal(Number.isInteger(indexer.getCursor().logIndex), true);

    const restartedStore = new SpaceStore();
    assert.equal(load(restartedStore, snapshotPath), true);
    assert.deepEqual(restartedStore.indexerCursors.get(indexer.cursorKey), indexer.getCursor());
    const restarted = new JobCreatedIndexer({
      store: restartedStore,
      chainId: chain.chainId,
      contractAddress: chain.contracts.AgenticCommerce,
      rpcUrl: chain.rpc,
      dataPath: snapshotPath,
    });

    const replay = await restarted.sync({ fromBlock: 0, toBlock: head });
    assert.equal(replay.processed, 0);
    assert.equal(restartedStore.jobs.size, 2);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_CREATED").length, 2);

    const duplicate = await restarted.sync({ toBlock: head });
    assert.equal(duplicate.processed, 0);
    assert.equal(restartedStore.jobs.size, 2);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_CREATED").length, 2);
    assert.equal(load(new SpaceStore(), snapshotPath), true);
    save(restartedStore, snapshotPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

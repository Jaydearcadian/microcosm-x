import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicClient, decodeEventLog, http } from "viem";
import { SpaceStore } from "../src/space-store.js";
import { JOB_CREATED_ABI, JobCreatedIndexer } from "../src/indexer.js";
import { ensureChain } from "./helpers/chain.mjs";
import { load, save } from "../../packages/server/src/persist.js";

let chain;
let publicClient;

function cast(...args) {
  return execFileSync("cast", args, { encoding: "utf8" }).trim();
}

async function createJob(description) {
  const expiry = String(Math.floor(Date.now() / 1000) + 86_400);
  const output = cast("send", chain.contracts.AgenticCommerce, "createJob(address,address,uint256,string)", chain.addrs.provider, chain.addrs.deployer, expiry, description, "--private-key", chain.keys.deployer, "--rpc-url", chain.rpc);
  const match = output.match(/transaction\s*hash\s*:?\s*(0x[0-9a-fA-F]{64})/i);
  if (!match) throw new Error(`Could not parse createJob transaction hash from cast output: ${output}`);
  const receipt = await publicClient.getTransactionReceipt({ hash: match[1] });
  const created = receipt.logs.map((log) => decodeEventLog({ abi: [JOB_CREATED_ABI], ...log })).find((log) => log.eventName === "JobCreated");
  if (!created) throw new Error('createJob receipt did not contain JobCreated');
  return Number(created.args[0]);
}

function fundJob(jobId, amount) {
  cast("send", chain.contracts.AgenticCommerce, "setBudget(uint256,uint256)", String(jobId), String(amount), "--private-key", chain.keys.deployer, "--rpc-url", chain.rpc);
  cast("send", chain.contracts.MockERC20, "approve(address,uint256)", chain.contracts.AgenticCommerce, String(amount), "--private-key", chain.keys.deployer, "--rpc-url", chain.rpc);
  cast("send", chain.contracts.AgenticCommerce, "fund(uint256,uint256)", String(jobId), String(amount), "--private-key", chain.keys.deployer, "--rpc-url", chain.rpc);
}

const indexedContract = "0x4444444444444444444444444444444444444444";
const spaceId = "space-procurement-001";

function createdLog({ jobId = 7n, blockNumber = 10, logIndex = 0, txDigit = "1" } = {}) {
  return {
    eventName: "JobCreated",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: {
      jobId,
      client: "0x1111111111111111111111111111111111111111",
      evaluator: "0x2222222222222222222222222222222222222222",
      provider: "0x3333333333333333333333333333333333333333",
      description: "indexed work",
      expiredAt: 2_000_000_000n,
    },
  };
}

function fundedLog({ jobId = 7n, amount = 123_456_789n, blockNumber = 10, logIndex = 1, txDigit = "2" } = {}) {
  return {
    eventName: "JobFunded",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, amount },
  };
}

function submittedLog({ jobId = 7n, deliverableHash = `0x${"a".repeat(64)}`, blockNumber = 10, logIndex = 2, txDigit = "3" } = {}) {
  return {
    eventName: "JobSubmitted",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, deliverableHash },
  };
}

function adjudicationLog({ jobId = 7n, adjudicator = "0x5555555555555555555555555555555555555555", caseId = `0x${"c".repeat(64)}`, blockNumber = 10, logIndex = 3, txDigit = "4" } = {}) {
  return {
    eventName: "AdjudicationRequested",
    blockNumber,
    transactionHash: `0x${txDigit.repeat(64)}`,
    logIndex,
    args: { jobId, adjudicator, caseId },
  };
}

function addOpenIndexedJob(store, log = createdLog()) {
  return store.upsertIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: log.args.jobId,
    client: log.args.client,
    provider: log.args.provider,
    evaluator: log.args.evaluator,
    description: log.args.description,
    expiredAt: log.args.expiredAt,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    logIndex: log.logIndex,
  });
}

function addFundedIndexedJob(store, created = createdLog(), funded = fundedLog()) {
  addOpenIndexedJob(store, created);
  return store.fundIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: funded.args.jobId,
    amount: funded.args.amount,
    blockNumber: funded.blockNumber,
    txHash: funded.transactionHash,
    logIndex: funded.logIndex,
  });
}

function addSubmittedIndexedJob(store, created = createdLog(), funded = fundedLog(), submitted = submittedLog()) {
  addFundedIndexedJob(store, created, funded);
  return store.submitIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: submitted.args.jobId,
    deliverableHash: submitted.args.deliverableHash,
    blockNumber: submitted.blockNumber,
    txHash: submitted.transactionHash,
    logIndex: submitted.logIndex,
  });
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
    eventName: "JobCreated",
    blockNumber: 10,
    transactionHash: `0x${"1".repeat(64)}`,
    logIndex: 0,
    args: [1n, "0x1111111111111111111111111111111111111111", "0x2222222222222222222222222222222222222222", "0x3333333333333333333333333333333333333333", "first", 2_000_000_000],
  };
  const second = {
    eventName: "JobCreated",
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
    const firstJobId = await createJob("First indexed work");
    const secondJobId = await createJob("Second indexed work");
    fundJob(secondJobId, 42_500000n);
    const head = Number(await publicClient.getBlockNumber());
    const store = new SpaceStore();
    const balanceBefore = store.getSpace(spaceId).balance;
    const spentBefore = store.getSpace(spaceId).totalSpentToday;
    const indexer = new JobCreatedIndexer({
      store,
      chainId: chain.chainId,
      contractAddress: chain.contracts.AgenticCommerce,
      rpcUrl: chain.rpc,
      dataPath: snapshotPath,
    });

    const first = await indexer.sync({ toBlock: head });
    assert.equal(first.processed, 3);
    assert.equal(store.jobs.size, 2);
    assert.equal(store.jobs.get(`onchain-${chain.chainId}-${chain.contracts.AgenticCommerce.slice(2, 10).toLowerCase()}-${firstJobId}`).status, "Open");
    assert.equal(store.jobs.get(`onchain-${chain.chainId}-${chain.contracts.AgenticCommerce.slice(2, 10).toLowerCase()}-${secondJobId}`).budget, "42.500000");
    assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_CREATED").length, 2);
    assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 1);
    assert.equal(store.getSpace(spaceId).balance, balanceBefore);
    assert.equal(store.getSpace(spaceId).totalSpentToday, spentBefore);
    assert.equal(store.receipts.size, 0);
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
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 1);
    assert.equal(restartedStore.getSpace(spaceId).balance, balanceBefore);
    assert.equal(restartedStore.receipts.size, 0);

    const duplicate = await restarted.sync({ toBlock: head });
    assert.equal(duplicate.processed, 0);
    assert.equal(restartedStore.jobs.size, 2);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_CREATED").length, 2);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 1);
    assert.equal(load(new SpaceStore(), snapshotPath), true);
    save(restartedStore, snapshotPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("M9-3: JobFunded transitions the indexed Open job and records its source log", () => {
  const store = new SpaceStore();
  const created = createdLog();
  const funded = fundedLog();
  const { job: openJob } = addOpenIndexedJob(store, created);

  const result = store.fundIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: funded.args.jobId,
    amount: funded.args.amount,
    blockNumber: funded.blockNumber,
    txHash: funded.transactionHash,
    logIndex: funded.logIndex,
  });

  assert.equal(result.funded, true);
  assert.equal(result.job.status, "Funded");
  assert.equal(result.job.budget, "123.456789");
  assert.equal(result.job.escrowedAmount, "123.456789");
  assert.equal(result.job.fundedAt, result.job.statusHistory.at(-1).timestamp);
  assert.deepEqual(result.job.statusHistory.at(-1), { status: "Funded", timestamp: result.job.fundedAt });
  assert.deepEqual(result.job.sourceLog, { blockNumber: 10, txHash: funded.transactionHash, logIndex: 1 });
  assert.notEqual(result.job.fundedAt, openJob.fundedAt);
  const activities = store.getActivity(spaceId);
  assert.equal(activities.filter((entry) => entry.type === "WORK_FUNDED").length, 1);
  assert.equal(activities.at(-1).fromStatus, "Open");
  assert.equal(activities.at(-1).toStatus, "Funded");
});

test("M9-3: JobFunded has no Space financial side effects", () => {
  const store = new SpaceStore();
  const funded = fundedLog();
  addOpenIndexedJob(store);
  const balanceBefore = store.getSpace(spaceId).balance;
  const spentBefore = store.getSpace(spaceId).totalSpentToday;
  const receiptsBefore = store.receipts.size;

  const { job } = store.fundIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: funded.args.jobId,
    amount: funded.args.amount,
    blockNumber: funded.blockNumber,
    txHash: funded.transactionHash,
    logIndex: funded.logIndex,
  });

  assert.equal(store.getSpace(spaceId).balance, balanceBefore);
  assert.equal(store.getSpace(spaceId).totalSpentToday, spentBefore);
  assert.equal(store.receipts.size, receiptsBefore);
  assert.equal(job.refunded, false);
  assert.equal(job.refundedAmount, null);
  assert.equal(job.settlement, null);
});

test("M9-3: combined indexer replay and repeated funding are idempotent", async () => {
  const store = new SpaceStore();
  const created = createdLog();
  const funded = fundedLog();
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [created, funded] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const first = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  assert.equal(first.processed, 2);
  const repeated = store.fundIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: funded.args.jobId,
    amount: funded.args.amount,
    blockNumber: funded.blockNumber,
    txHash: funded.transactionHash,
    logIndex: funded.logIndex,
  });
  const replay = await indexer.sync({ fromBlock: 0, toBlock: 10 });

  assert.equal(repeated.funded, false);
  assert.equal(replay.processed, 0);
  assert.equal(replay.skipped, 2);
  assert.equal(store.jobs.size, 1);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 1);
  assert.equal(store.indexerCursors.size, 1);
});

test("M9-3: combined indexer applies same-block logs in canonical order", async () => {
  const store = new SpaceStore();
  const created = createdLog({ logIndex: 3 });
  const funded = fundedLog({ logIndex: 4 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [funded, created] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });

  assert.equal(result.processed, 2);
  assert.equal(store.jobs.size, 1);
  assert.equal([...store.jobs.values()][0].status, "Funded");
  assert.deepEqual(store.getActivity(spaceId).slice(-2).map((entry) => entry.type), ["WORK_CREATED", "WORK_FUNDED"]);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: funded.transactionHash, logIndex: 4 });
});

test("M9-3: JobFunded before JobCreated fails loudly", async () => {
  const store = new SpaceStore();
  const funded = fundedLog({ logIndex: 0 });
  const created = createdLog({ logIndex: 1 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [funded, created] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  await assert.rejects(indexer.sync({ fromBlock: 0, toBlock: 10 }), /unknown indexed job/);
  assert.equal(store.jobs.size, 0);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 0);
  assert.equal(indexer.getCursor(), null);
});

test("M9-3: JobFunded projection persists across restart", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "microcosm-m9-funded-"));
  const snapshotPath = path.join(directory, "store.json");
  try {
    const created = createdLog({ blockNumber: 20, logIndex: 2 });
    const funded = fundedLog({ blockNumber: 20, logIndex: 3 });
    const client = { getBlockNumber: async () => 20n, getLogs: async () => [created, funded] };
    const store = new SpaceStore();
    const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });

    await indexer.sync({ fromBlock: 0, toBlock: 20 });
    const cursor = indexer.getCursor();
    const restartedStore = new SpaceStore();
    assert.equal(load(restartedStore, snapshotPath), true);
    const restarted = new JobCreatedIndexer({ store: restartedStore, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });
    const replay = await restarted.sync({ fromBlock: 0, toBlock: 20 });
    const restartedJob = [...restartedStore.jobs.values()][0];

    assert.equal(replay.processed, 0);
    assert.equal(replay.skipped, 2);
    assert.equal(restartedJob.status, "Funded");
    assert.equal(restartedJob.budget, "123.456789");
    assert.equal(restartedJob.escrowedAmount, "123.456789");
    assert.deepEqual(restartedJob.sourceLog, { blockNumber: 20, txHash: funded.transactionHash, logIndex: 3 });
    assert.deepEqual(restartedStore.indexerCursors.get(restarted.cursorKey), cursor);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_FUNDED").length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("M9-4: JobSubmitted transitions Funded to Submitted and records its source log", () => {
  const store = new SpaceStore();
  const submitted = submittedLog();
  addFundedIndexedJob(store);

  const result = store.submitIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: submitted.args.jobId,
    deliverableHash: submitted.args.deliverableHash,
    blockNumber: submitted.blockNumber,
    txHash: submitted.transactionHash,
    logIndex: submitted.logIndex,
  });

  assert.equal(result.submitted, true);
  assert.equal(result.job.status, "Submitted");
  assert.equal(result.job.deliverableHash, submitted.args.deliverableHash);
  assert.equal(result.job.submittedAt, result.job.statusHistory.at(-1).timestamp);
  assert.deepEqual(result.job.statusHistory.at(-1), { status: "Submitted", timestamp: result.job.submittedAt });
  assert.deepEqual(result.job.statusHistory.map((entry) => entry.status), ["Open", "Funded", "Submitted"]);
  assert.deepEqual(result.job.sourceLog, { blockNumber: 10, txHash: submitted.transactionHash, logIndex: 2 });
  const activities = store.getActivity(spaceId).filter((entry) => entry.type === "WORK_SUBMITTED");
  assert.equal(activities.length, 1);
  assert.equal(activities[0].deliverableHash, submitted.args.deliverableHash);
  assert.equal(activities[0].fromStatus, "Funded");
  assert.equal(activities[0].toStatus, "Submitted");
});

test("M9-4: JobSubmitted has no Space financial side effects", () => {
  const store = new SpaceStore();
  const submitted = submittedLog();
  const { job: fundedJob } = addFundedIndexedJob(store);
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const receiptsBefore = store.receipts.size;
  store._settleJob = async () => { throw new Error("settlement must not run"); };
  store._claimRefund = () => { throw new Error("refund must not run"); };

  const { job } = store.submitIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: submitted.args.jobId,
    deliverableHash: submitted.args.deliverableHash,
    blockNumber: submitted.blockNumber,
    txHash: submitted.transactionHash,
    logIndex: submitted.logIndex,
  });

  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
  assert.equal(store.receipts.size, receiptsBefore);
  assert.equal(job.budget, fundedJob.budget);
  assert.equal(job.escrowedAmount, fundedJob.escrowedAmount);
  assert.equal(job.refunded, false);
  assert.equal(job.refundedAmount, null);
  assert.equal(job.settlement, null);
});

test("M9-4: combined indexer replay is idempotent and conflicts loudly", async () => {
  const store = new SpaceStore();
  const created = createdLog();
  const funded = fundedLog();
  const submitted = submittedLog();
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [created, funded, submitted] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const first = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const repeated = store.submitIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: submitted.args.jobId,
    deliverableHash: submitted.args.deliverableHash,
    blockNumber: submitted.blockNumber,
    txHash: submitted.transactionHash,
    logIndex: submitted.logIndex,
  });
  const replay = await indexer.sync({ fromBlock: 0, toBlock: 10 });

  assert.equal(first.processed, 3);
  assert.equal(repeated.submitted, false);
  assert.equal(replay.processed, 0);
  assert.equal(replay.skipped, 3);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_SUBMITTED").length, 1);
  assert.equal(store.indexerCursors.size, 1);
  assert.throws(() => store.submitIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: submitted.args.jobId,
    deliverableHash: `0x${"b".repeat(64)}`,
    blockNumber: submitted.blockNumber,
    txHash: submitted.transactionHash,
    logIndex: submitted.logIndex,
  }), /from 'Submitted'/);
});

test("M9-4: combined indexer applies same-block JobSubmitted in canonical order", async () => {
  const store = new SpaceStore();
  const created = createdLog({ logIndex: 3 });
  const funded = fundedLog({ logIndex: 4 });
  const submitted = submittedLog({ logIndex: 5 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [submitted, funded, created] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const job = [...store.jobs.values()][0];

  assert.equal(result.processed, 3);
  assert.equal(job.status, "Submitted");
  assert.equal(job.deliverableHash, submitted.args.deliverableHash);
  assert.deepEqual(store.getActivity(spaceId).slice(-3).map((entry) => entry.type), ["WORK_CREATED", "WORK_FUNDED", "WORK_SUBMITTED"]);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: submitted.transactionHash, logIndex: 5 });
});

test("M9-4: JobSubmitted before JobFunded fails loudly", async () => {
  const store = new SpaceStore();
  const created = createdLog({ logIndex: 1 });
  const submitted = submittedLog({ logIndex: 2 });
  const funded = fundedLog({ logIndex: 3 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [created, submitted, funded] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  await assert.rejects(indexer.sync({ fromBlock: 0, toBlock: 10 }), /cannot transition indexed job .* from 'Open'/);
  assert.equal([...store.jobs.values()][0].status, "Open");
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_SUBMITTED").length, 0);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: created.transactionHash, logIndex: 1 });
});

test("M9-4: JobSubmitted projection persists across restart", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "microcosm-m9-submitted-"));
  const snapshotPath = path.join(directory, "store.json");
  try {
    const created = createdLog({ blockNumber: 20, logIndex: 4 });
    const funded = fundedLog({ blockNumber: 20, logIndex: 5 });
    const submitted = submittedLog({ blockNumber: 20, logIndex: 6 });
    const client = { getBlockNumber: async () => 20n, getLogs: async () => [created, funded, submitted] };
    const store = new SpaceStore();
    const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });

    await indexer.sync({ fromBlock: 0, toBlock: 20 });
    const cursor = indexer.getCursor();
    const restartedStore = new SpaceStore();
    assert.equal(load(restartedStore, snapshotPath), true);
    const restarted = new JobCreatedIndexer({ store: restartedStore, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });
    const replay = await restarted.sync({ fromBlock: 0, toBlock: 20 });
    const restartedJob = [...restartedStore.jobs.values()][0];

    assert.equal(replay.processed, 0);
    assert.equal(replay.skipped, 3);
    assert.equal(restartedJob.status, "Submitted");
    assert.equal(restartedJob.deliverableHash, submitted.args.deliverableHash);
    assert.deepEqual(restartedJob.sourceLog, { blockNumber: 20, txHash: submitted.transactionHash, logIndex: 6 });
    assert.deepEqual(restartedStore.indexerCursors.get(restarted.cursorKey), cursor);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_SUBMITTED").length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("M9-5: AdjudicationRequested transitions Submitted to Adjudicating and records its source log", () => {
  const store = new SpaceStore();
  const requested = adjudicationLog();
  addSubmittedIndexedJob(store);

  const result = store.requestAdjudicationIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: requested.args.jobId,
    adjudicator: requested.args.adjudicator,
    caseId: requested.args.caseId,
    blockNumber: requested.blockNumber,
    txHash: requested.transactionHash,
    logIndex: requested.logIndex,
  });

  assert.equal(result.requested, true);
  assert.equal(result.job.status, "Adjudicating");
  assert.equal(result.job.adjudicator, requested.args.adjudicator);
  assert.equal(result.job.adjudication.caseId, requested.args.caseId);
  assert.equal(result.job.adjudication.deliverableHash, submittedLog().args.deliverableHash);
  assert.deepEqual(result.job.statusHistory.map((entry) => entry.status), ["Open", "Funded", "Submitted", "Adjudicating"]);
  assert.deepEqual(result.job.sourceLog, { blockNumber: 10, txHash: requested.transactionHash, logIndex: 3 });
  const activity = store.getActivity(spaceId).filter((entry) => entry.type === "WORK_ADJUDICATION_REQUESTED");
  assert.equal(activity.length, 1);
  assert.equal(activity[0].adjudicator, requested.args.adjudicator);
  assert.equal(activity[0].caseId, requested.args.caseId);
  assert.equal(activity[0].fromStatus, "Submitted");
  assert.equal(activity[0].toStatus, "Adjudicating");
});

test("M9-5: AdjudicationRequested has no Space financial side effects", () => {
  const store = new SpaceStore();
  const requested = adjudicationLog();
  addSubmittedIndexedJob(store);
  const spaceBefore = structuredClone(store.getSpace(spaceId));
  const receiptsBefore = store.receipts.size;
  store.requestVerdict = () => { throw new Error("requestVerdict must not run"); };
  store._settleJob = async () => { throw new Error("settlement must not run"); };
  store._claimRefund = () => { throw new Error("refund must not run"); };

  const { job } = store.requestAdjudicationIndexedJob({
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: requested.args.jobId,
    adjudicator: requested.args.adjudicator,
    caseId: requested.args.caseId,
    blockNumber: requested.blockNumber,
    txHash: requested.transactionHash,
    logIndex: requested.logIndex,
  });

  assert.deepEqual(store.getSpace(spaceId), spaceBefore);
  assert.equal(store.receipts.size, receiptsBefore);
  assert.equal(job.budget, "123.456789");
  assert.equal(job.escrowedAmount, "123.456789");
  assert.equal(job.refunded, false);
  assert.equal(job.refundedAmount, null);
  assert.equal(job.settlement, null);
});

test("M9-5: AdjudicationRequested replay is idempotent and conflicts loudly", () => {
  const store = new SpaceStore();
  const requested = adjudicationLog();
  addSubmittedIndexedJob(store);
  const input = {
    spaceId,
    chainId: 1952,
    contractAddress: indexedContract,
    onchainJobId: requested.args.jobId,
    adjudicator: requested.args.adjudicator,
    caseId: requested.args.caseId,
    blockNumber: requested.blockNumber,
    txHash: requested.transactionHash,
    logIndex: requested.logIndex,
  };

  assert.equal(store.requestAdjudicationIndexedJob(input).requested, true);
  assert.equal(store.requestAdjudicationIndexedJob(input).requested, false);
  assert.throws(() => store.requestAdjudicationIndexedJob({ ...input, caseId: `0x${"d".repeat(64)}` }), /from 'Adjudicating'/);
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_ADJUDICATION_REQUESTED").length, 1);
});

test("M9-5: combined indexer applies AdjudicationRequested in same-block canonical order", async () => {
  const store = new SpaceStore();
  const created = createdLog({ logIndex: 3 });
  const funded = fundedLog({ logIndex: 4 });
  const submitted = submittedLog({ logIndex: 5 });
  const requested = adjudicationLog({ logIndex: 6 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [requested, submitted, funded, created] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  const result = await indexer.sync({ fromBlock: 0, toBlock: 10 });
  const job = [...store.jobs.values()][0];

  assert.equal(result.processed, 4);
  assert.equal(job.status, "Adjudicating");
  assert.equal(job.adjudication.caseId, requested.args.caseId);
  assert.deepEqual(store.getActivity(spaceId).slice(-4).map((entry) => entry.type), ["WORK_CREATED", "WORK_FUNDED", "WORK_SUBMITTED", "WORK_ADJUDICATION_REQUESTED"]);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: requested.transactionHash, logIndex: 6 });
});

test("M9-5: AdjudicationRequested before JobSubmitted fails loudly", async () => {
  const store = new SpaceStore();
  const created = createdLog({ logIndex: 0 });
  const requested = adjudicationLog({ logIndex: 1 });
  const client = { getBlockNumber: async () => 10n, getLogs: async () => [created, requested] };
  const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client });

  await assert.rejects(indexer.sync({ fromBlock: 0, toBlock: 10 }), /from 'Open'/);
  assert.equal([...store.jobs.values()][0].status, "Open");
  assert.equal(store.getActivity(spaceId).filter((entry) => entry.type === "WORK_ADJUDICATION_REQUESTED").length, 0);
  assert.deepEqual(indexer.getCursor(), { blockNumber: 10, txHash: created.transactionHash, logIndex: 0 });
});

test("M9-5: AdjudicationRequested projection persists across restart", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "microcosm-m9-adjudication-"));
  const snapshotPath = path.join(directory, "store.json");
  try {
    const created = createdLog({ blockNumber: 20, logIndex: 4 });
    const funded = fundedLog({ blockNumber: 20, logIndex: 5 });
    const submitted = submittedLog({ blockNumber: 20, logIndex: 6 });
    const requested = adjudicationLog({ blockNumber: 20, logIndex: 7 });
    const client = { getBlockNumber: async () => 20n, getLogs: async () => [created, funded, submitted, requested] };
    const store = new SpaceStore();
    const indexer = new JobCreatedIndexer({ store, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });

    await indexer.sync({ fromBlock: 0, toBlock: 20 });
    const cursor = indexer.getCursor();
    const restartedStore = new SpaceStore();
    assert.equal(load(restartedStore, snapshotPath), true);
    const restarted = new JobCreatedIndexer({ store: restartedStore, chainId: 1952, contractAddress: indexedContract, client, dataPath: snapshotPath });
    const replay = await restarted.sync({ fromBlock: 0, toBlock: 20 });
    const restartedJob = [...restartedStore.jobs.values()][0];

    assert.equal(replay.processed, 0);
    assert.equal(replay.skipped, 4);
    assert.equal(restartedJob.status, "Adjudicating");
    assert.equal(restartedJob.adjudicator, requested.args.adjudicator);
    assert.equal(restartedJob.adjudication.caseId, requested.args.caseId);
    assert.deepEqual(restartedJob.sourceLog, { blockNumber: 20, txHash: requested.transactionHash, logIndex: 7 });
    assert.deepEqual(restartedStore.indexerCursors.get(restarted.cursorKey), cursor);
    assert.equal(restartedStore.getActivity(spaceId).filter((entry) => entry.type === "WORK_ADJUDICATION_REQUESTED").length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
